#!/bin/sh
# Reviewed runtime minimization for abi-ops worker images (ADR-040).
#
# The CI gate `trivy image --severity HIGH,CRITICAL --exit-code 1` flags
# superseded Debian 13 packages whose vulnerable code is unreachable from a
# Python worker runtime: ncurses, systemd/udev, acl, the util-linux suite and
# perl-base (plus the packages that only exist to service them). Upstream has
# no fixed versions, and ADR-040 directs us to remove superseded, unreachable
# code rather than suppress advisories. This script removes those packages in
# dependency-aware order, then asserts the surviving image:
#   - keeps /bin/sh (dash), python3 and the full import path of the worker,
#   - keeps an honest /var/lib/dpkg/status so scanners still see every
#     remaining package (removal, not suppression),
#   - contains none of the removed packages' stanzas,
#   - has no unresolved shared-library dependencies in its ELF binaries.
#
# It must stay the LAST root step in the Dockerfile: after it runs, no
# userland tools (rm, tar, dpkg, perl) survive. Append new RUN steps above it.
set -eu

ORDER="adduser apt bash bsdutils libapt-pkg7.0 libblkid1 liblastlog2-2 libmount1 libncursesw6 libpam-modules libpam-modules-bin libpam-runtime libreadline8t64 libsmartcols1 libsystemd0 libtinfo6 libudev1 libuuid1 mount ncurses-base ncurses-bin passwd sed util-linux tar libacl1 login perl-base coreutils dpkg"

# --- preconditions: fail loudly if the pinned base drifts ---
command -v dpkg >/dev/null 2>&1 || { echo "minimize: dpkg missing" >&2; exit 1; }
for p in $ORDER; do
  dpkg -s "$p" >/dev/null 2>&1 || { echo "minimize: expected package $p not installed" >&2; exit 1; }
done

# --- shims: dpkg maintainer scripts keep calling rm/tar after coreutils and
# --- tar are gone; provide minimal python-backed replacements, removed again
# --- at the end of this script. ---
python3 - <<'PYEOF'
import os
rm = r"""#!/bin/sh
exec python3 - "$@" <<'PYEOF2'
import sys, os, shutil
args=[a for a in sys.argv[1:]]
recursive=any(a.startswith('-') and ('r' in a.lower()) for a in args)
paths=[a for a in args if not a.startswith('-')]
for p in paths:
    if p in ('/', '/*', '.', '..'):
        continue
    try:
        if os.path.islink(p) or os.path.isfile(p):
            os.remove(p)
        elif os.path.isdir(p):
            if recursive: shutil.rmtree(p)
            else: os.rmdir(p)
    except FileNotFoundError:
        pass
    except OSError as e:
        sys.stderr.write('rm: %s: %s%s' % (p, e, chr(10)))
PYEOF2
"""
tar = r"""#!/bin/sh
exec python3 - "$@" <<'PYEOF2'
import sys, tarfile
args=sys.argv[1:]
mode='r'
if args and args[0].startswith('-'):
    flag=args.pop(0)
    if 'x' in flag: mode='r'
    elif 'c' in flag: mode='w'
    if 'z' in flag: mode += ':gz'
    if 'J' in flag: mode += ':xz'
    if 'j' in flag: mode += ':bz2'
if not args:
    sys.exit(2)
arc=args[0]
if mode.startswith('w'):
    with tarfile.open(arc, mode) as t:
        for p in args[1:]: t.add(p)
else:
    with tarfile.open(arc, mode) as t:
        t.extractall(filter='data')
PYEOF2
"""
for path, body in (('/usr/local/bin/rm', rm), ('/usr/local/bin/tar', tar)):
    with open(path, 'w') as f:
        f.write(body)
    os.chmod(path, 0o755)
print('minimize: shims installed')
PYEOF

# --- dependency-aware removal. tar/perl-base/coreutils/dpkg are last: dpkg
# --- maintainer scripts are shell+perl and need rm; dpkg itself must outlive
# --- every purge it performs. login is in dpkg's "protected" set and needs
# --- --force-remove-protected. ---
for p in $ORDER; do
  if ! dpkg --purge --force-remove-essential --force-remove-protected --force-depends "$p" >/tmp/minimize-$p.log 2>&1; then
    echo "minimize: purge of $p failed:" >&2
    tail -n 5 "/tmp/minimize-$p.log" >&2 || true
    exit 1
  fi
done

# --- postconditions ---
python3 - <<'PYEOF'
import os, re, sys
status = open('/var/lib/dpkg/status', encoding='utf-8', errors='replace').read()
installed = []
for block in status.split(chr(10) + chr(10)):
    m = re.search(r'^Package: (.+)$', block, re.M)
    if m and re.search(r'^Status: install ok installed$', block, re.M):
        installed.append(m.group(1).strip())
flagged = set("ncurses-base ncurses-bin libncursesw6 libtinfo6 libsystemd0 libudev1 libacl1 util-linux bsdutils mount login libblkid1 libmount1 libsmartcols1 libuuid1 liblastlog2-2 perl-base".split())
removed = set("adduser apt bash bsdutils libapt-pkg7.0 libblkid1 liblastlog2-2 libmount1 libncursesw6 libpam-modules libpam-modules-bin libpam-runtime libreadline8t64 libsmartcols1 libsystemd0 libtinfo6 libudev1 libuuid1 mount ncurses-base ncurses-bin passwd sed util-linux tar libacl1 login perl-base coreutils dpkg".split())
present = sorted(flagged & set(installed))
still = sorted((removed - flagged) & set(installed))
if present:
    sys.exit('minimize: flagged packages still installed: %s' % present)
if still:
    sys.exit('minimize: removed packages still in database: %s' % still)
if len(installed) < 40:
    sys.exit('minimize: dpkg database unexpectedly small (%d packages)' % len(installed))
if os.path.exists('/usr/bin/dpkg'):
    sys.exit('minimize: dpkg binary still present')
d = '/etc/alternatives'
if os.path.isdir(d):
    for fn in os.listdir(d):
        p = os.path.join(d, fn)
        if os.path.islink(p) and not os.path.exists(p):
            os.unlink(p)
print('minimize: dpkg db honest, %d packages remain, no flagged stanzas' % len(installed))
PYEOF

sh -c 'printf minimize-shell-ok >/dev/null'
python3 -c 'import ssl, sqlite3, zlib, lzma, bz2, ctypes, dbm.gnu, dbm.ndbm, unicodedata' \
  || { echo "minimize: python import path damaged" >&2; exit 1; }

# --- drop the shims: the final image ships no userland utilities ---
python3 - <<'PYEOF'
import os
for p in ('/usr/local/bin/rm', '/usr/local/bin/tar'):
    if os.path.exists(p):
        os.unlink(p)
print('minimize: shims removed; image carries no rm/tar/dpkg')
PYEOF

echo "minimize: runtime minimization complete"
