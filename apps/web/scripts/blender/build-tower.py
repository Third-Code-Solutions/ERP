"""
Builds the ABI OPS landing-page tower in Blender and exports it as GLB.

    blender -b -P build-tower.py -- --glb ../../public/models/abi-tower.glb \
        [--preview preview.png]

The web scene (src/components/marketing/abi-tower-scene.ts) drives the model by
object name, so the names below are an interface:

    site_ground, plaza, trees, neighbors, site_fence
    slab_NN / glass_NN      one pair per floor, origin at the floor base
    podium_slab, podium_glass
    core                    origin at ground, rises with scale
    diagrid_NN              one exoskeleton module per three floors
    crown_box, crown_fins, mast
    crane_mast, crane_jib   jib origin is its slewing pivot
    truck_a, truck_b        origin at the vehicle centre

Z is up in Blender; the glTF exporter converts to Y up.
"""
import bmesh
import bpy
import math
import random
import sys
from mathutils import Matrix, Vector

random.seed(7)

# --------------------------------------------------------------------------
# Parameters
# --------------------------------------------------------------------------
FLOORS = 26
FLOOR_H = 3.6
SLAB_T = 0.55
GLASS_H = 3.0
PODIUM_H = 11.0
TOWER_BASE_Z = PODIUM_H
TOP_Z = TOWER_BASE_Z + FLOORS * FLOOR_H
W0, W1 = 38.0, 25.0          # width at base / top
D0, D1 = 29.0, 19.0          # depth at base / top
TWIST_DEG = 52.0
CORNER_R = 4.0
FIN_SPACING = 2.4
DIAGRID_STEP = 3             # floors per exoskeleton module


def args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    out = {"glb": "abi-tower.glb", "preview": None}
    for i, a in enumerate(argv):
        if a == "--glb":
            out["glb"] = argv[i + 1]
        if a == "--preview":
            out["preview"] = argv[i + 1]
    return out


# --------------------------------------------------------------------------
# Materials
# --------------------------------------------------------------------------
def material(name, color, rough=0.6, metal=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        try:
            mat.surface_render_method = "BLENDED"
        except AttributeError:
            mat.blend_method = "BLEND"
    return mat


# --------------------------------------------------------------------------
# Geometry helpers
# --------------------------------------------------------------------------
def rrect(w, d, r, seg=6):
    """Counter-clockwise rounded rectangle outline."""
    pts = []
    corners = [
        (w / 2 - r, d / 2 - r, 0),
        (-(w / 2 - r), d / 2 - r, 90),
        (-(w / 2 - r), -(d / 2 - r), 180),
        (w / 2 - r, -(d / 2 - r), 270),
    ]
    for cx, cy, a0 in corners:
        for s in range(seg + 1):
            a = math.radians(a0 + 90.0 * s / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def rotate(pts, theta):
    c, s = math.cos(theta), math.sin(theta)
    return [(x * c - y * s, x * s + y * c) for x, y in pts]


def add_prism(bm, pts, z0, z1):
    bottom = [bm.verts.new((x, y, z0)) for x, y in pts]
    top = [bm.verts.new((x, y, z1)) for x, y in pts]
    bm.faces.new(list(reversed(bottom)))
    bm.faces.new(top)
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bottom[i], bottom[j], top[j], top[i]))


def add_box(bm, center, size, basis=None):
    """Box centred at `center`; `basis` is (u, v, w) orthonormal Vectors."""
    u, v, w = basis or (Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
    cx, cy, cz = Vector(center)
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    verts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                verts.append(bm.verts.new(cx_vec(cx, cy, cz) + u * (sx * hx) + v * (sy * hy) + w * (sz * hz)))
    idx = lambda sx, sy, sz: ((sx + 1) // 2) * 4 + ((sy + 1) // 2) * 2 + ((sz + 1) // 2)
    quads = [
        ((-1, -1, -1), (-1, 1, -1), (1, 1, -1), (1, -1, -1)),
        ((-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)),
        ((-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1)),
        ((-1, 1, -1), (-1, 1, 1), (1, 1, 1), (1, 1, -1)),
        ((-1, -1, -1), (-1, -1, 1), (-1, 1, 1), (-1, 1, -1)),
        ((1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)),
    ]
    for q in quads:
        bm.faces.new([verts[idx(*c)] for c in q])


def cx_vec(x, y, z):
    return Vector((x, y, z))


def add_beam(bm, p0, p1, r, sides=6):
    p0, p1 = Vector(p0), Vector(p1)
    axis = p1 - p0
    if axis.length < 1e-4:
        return
    a = axis.normalized()
    helper = Vector((0, 0, 1)) if abs(a.z) < 0.9 else Vector((1, 0, 0))
    u = a.cross(helper).normalized()
    v = a.cross(u)
    ring0, ring1 = [], []
    for i in range(sides):
        ang = 2 * math.pi * i / sides
        off = u * (math.cos(ang) * r) + v * (math.sin(ang) * r)
        ring0.append(bm.verts.new(p0 + off))
        ring1.append(bm.verts.new(p1 + off))
    for i in range(sides):
        j = (i + 1) % sides
        bm.faces.new((ring0[i], ring0[j], ring1[j], ring1[i]))


def add_cone(bm, base, radius, height, segments=7, top_radius=0.0):
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segments,
        radius1=radius,
        radius2=top_radius,
        depth=height,
        matrix=Matrix.Translation((base[0], base[1], base[2] + height / 2)),
    )


def finish(name, bm, mat, location=(0, 0, 0), smooth=False):
    mesh = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    if smooth:
        for poly in mesh.polygons:
            poly.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    return obj


def smoothstep(t):
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


# --------------------------------------------------------------------------
# Tower shape per floor
# --------------------------------------------------------------------------
def floor_shape(i):
    t = i / (FLOORS - 1)
    taper = t ** 1.15
    w = lerp(W0, W1, taper)
    d = lerp(D0, D1, taper)
    theta = math.radians(TWIST_DEG) * smoothstep(t)
    return w, d, theta


def fin_boxes(outline, z0, z1):
    """Sample points along a closed outline, spaced FIN_SPACING apart."""
    samples = []
    carry = 0.0
    n = len(outline)
    for i in range(n):
        a = Vector((*outline[i], 0))
        b = Vector((*outline[(i + 1) % n], 0))
        seg = b - a
        length = seg.length
        if length < 1e-6:
            continue
        tangent = seg / length
        pos = FIN_SPACING - carry
        while pos <= length:
            samples.append((a + tangent * pos, tangent))
            pos += FIN_SPACING
        carry = length - (pos - FIN_SPACING)
    return samples


# --------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------
def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    m_ground = material("ground", (0.93, 0.93, 0.92), 0.95)
    m_plaza = material("plaza", (0.86, 0.86, 0.84), 0.9)
    m_concrete = material("concrete", (0.93, 0.92, 0.89), 0.8)
    m_core = material("core", (0.10, 0.17, 0.26), 0.55, 0.2)
    m_glass = material("glass", (0.42, 0.68, 0.84), 0.08, 0.0, 0.34)
    m_gold = material("gold", (0.88, 0.48, 0.16), 0.3, 0.9)
    m_steel = material("steel", (0.06, 0.17, 0.29), 0.45, 0.7)
    m_tree = material("tree", (0.30, 0.48, 0.32), 0.9)
    m_context = material("context", (0.82, 0.84, 0.86), 0.85)
    m_truck = material("truck", (0.88, 0.52, 0.18), 0.55)
    m_dark = material("dark", (0.1, 0.11, 0.13), 0.7)

    # ---- ground, plaza -----------------------------------------------------
    bm = bmesh.new()
    pts = [(150 * math.cos(a), 150 * math.sin(a)) for a in [2 * math.pi * k / 64 for k in range(64)]]
    add_prism(bm, pts, -0.7, 0.0)
    finish("site_ground", bm, m_ground)

    bm = bmesh.new()
    add_prism(bm, rrect(96, 76, 8, 5), 0.0, 0.2)
    finish("plaza", bm, m_plaza)

    # ---- podium --------------------------------------------------------------
    outline = rrect(62, 46, 7, 7)
    bm = bmesh.new()
    for z in (0.0, 5.2, PODIUM_H - 0.55):
        add_prism(bm, outline, z, z + 0.55)
    finish("podium_slab", bm, m_concrete)

    bm = bmesh.new()
    for z0 in (0.55, 5.75):
        add_prism(bm, [(x * 0.997, y * 0.997) for x, y in outline], z0, z0 + 4.55)
    for pos, tan in fin_boxes(outline, 0.55, PODIUM_H - 0.55):
        normal = Vector((tan.y, -tan.x, 0))
        basis = (tan, normal, Vector((0, 0, 1)))
        for z0 in (0.55, 5.75):
            add_box(bm, pos + normal * 0.18 + Vector((0, 0, z0 + 2.27)), (0.16, 0.4, 4.55), basis)
    finish("podium_glass", bm, m_glass)

    # ---- tower floors --------------------------------------------------------
    for i in range(FLOORS):
        w, d, theta = floor_shape(i)
        outline = rotate(rrect(w, d, CORNER_R, 6), theta)
        base = (0, 0, TOWER_BASE_Z + i * FLOOR_H)

        bm = bmesh.new()
        add_prism(bm, [(x * 1.012, y * 1.012) for x, y in outline], 0.0, SLAB_T)
        finish(f"slab_{i + 1:02d}", bm, m_concrete, base)

        bm = bmesh.new()
        add_prism(bm, outline, SLAB_T, SLAB_T + GLASS_H)
        for pos, tan in fin_boxes(outline, SLAB_T, SLAB_T + GLASS_H):
            normal = Vector((tan.y, -tan.x, 0))
            basis = (tan, normal, Vector((0, 0, 1)))
            add_box(bm, pos + normal * 0.16 + Vector((0, 0, SLAB_T + GLASS_H / 2)), (0.14, 0.34, GLASS_H), basis)
        finish(f"glass_{i + 1:02d}", bm, m_glass, base)

    # ---- core -----------------------------------------------------------------
    bm = bmesh.new()
    add_prism(bm, rrect(12.0, 9.5, 1.2, 3), 0.0, TOP_Z - 2.0)
    finish("core", bm, m_core)

    # ---- diagrid exoskeleton ---------------------------------------------------
    def anchors(i, grow):
        w, d, theta = floor_shape(i)
        raw = [
            (w / 2, d / 2), (0, d / 2), (-w / 2, d / 2), (-w / 2, 0),
            (-w / 2, -d / 2), (0, -d / 2), (w / 2, -d / 2), (w / 2, 0),
        ]
        pts = []
        for x, y in rotate(raw, theta):
            length = math.hypot(x, y) or 1.0
            pts.append((x * (1 + grow / length), y * (1 + grow / length)))
        return pts

    modules = FLOORS // DIAGRID_STEP
    for m in range(modules):
        a_i, b_i = m * DIAGRID_STEP, (m + 1) * DIAGRID_STEP - 1
        za = TOWER_BASE_Z + a_i * FLOOR_H
        zb = TOWER_BASE_Z + (b_i + 1) * FLOOR_H
        pa, pb = anchors(a_i, 0.75), anchors(b_i, 0.75)
        bm = bmesh.new()
        for k in range(8):
            k2 = (k + 1) % 8
            add_beam(bm, (*pa[k], za), (*pb[k2], zb), 0.22)
            add_beam(bm, (*pa[k2], za), (*pb[k], zb), 0.22)
            add_beam(bm, (*pb[k], zb), (*pb[k2], zb), 0.26)
        finish(f"diagrid_{m + 1:02d}", bm, m_steel)

    # ---- crown -----------------------------------------------------------------
    w, d, theta = floor_shape(FLOORS - 1)
    top_outline = rotate(rrect(w, d, CORNER_R, 6), theta)
    bm = bmesh.new()
    add_prism(bm, [(x * 1.012, y * 1.012) for x, y in top_outline], 0.0, SLAB_T)
    add_prism(bm, rrect(w * 0.55, d * 0.5, 2.0, 4), SLAB_T, SLAB_T + 5.0)
    finish("crown_box", bm, m_concrete, (0, 0, TOP_Z))

    bm = bmesh.new()
    fins = 9
    for k in range(fins):
        ang = 2 * math.pi * k / fins + theta
        rx, ry = math.cos(ang), math.sin(ang)
        r_out = min(w, d) * 0.46
        base = Vector((rx * r_out, ry * r_out, SLAB_T))
        tip = Vector((rx * r_out * 0.18, ry * r_out * 0.18, SLAB_T + 15 + 4 * math.sin(k * 1.7)))
        add_beam(bm, base, tip, 0.34, sides=4)
    finish("crown_fins", bm, m_gold, (0, 0, TOP_Z))

    bm = bmesh.new()
    add_beam(bm, (0, 0, SLAB_T + 5.0), (0, 0, SLAB_T + 30), 0.28)
    add_cone(bm, (0, 0, SLAB_T + 30), 0.5, 2.4, 6)
    finish("mast", bm, m_gold, (0, 0, TOP_Z))

    # ---- tower crane -----------------------------------------------------------
    cx, cy = -43.0, -27.0
    crane_h = TOP_Z + 6
    mast_w = 2.6
    bm = bmesh.new()
    corners = [(mast_w / 2, mast_w / 2), (-mast_w / 2, mast_w / 2), (-mast_w / 2, -mast_w / 2), (mast_w / 2, -mast_w / 2)]
    for x, y in corners:
        add_beam(bm, (x, y, 0), (x, y, crane_h), 0.16)
    steps = int(crane_h // 3.2)
    for s in range(steps):
        z0, z1 = s * 3.2, (s + 1) * 3.2
        for k in range(4):
            a, b = corners[k], corners[(k + 1) % 4]
            add_beam(bm, (*a, z0), (*b, z0), 0.07, 4)
            add_beam(bm, (*a, z0), (*b, z1) if s % 2 == 0 else (*b, z0), 0.07, 4)
    finish("crane_mast", bm, m_gold, (cx, cy, 0))

    bm = bmesh.new()
    jib_len, back_len, jib_h = 62.0, 20.0, 3.0
    chords = [(0.0, jib_h), (1.4, 0.0), (-1.4, 0.0)]
    for y, z in chords:
        add_beam(bm, (-back_len, y, z), (jib_len, y, z), 0.12)
    x = -back_len
    flip = 1
    while x < jib_len - 3:
        nx = x + 3.0
        add_beam(bm, (x, 1.4, 0), (nx, 0, jib_h), 0.06, 4)
        add_beam(bm, (x, -1.4, 0), (nx, 0, jib_h), 0.06, 4)
        add_beam(bm, (x, 1.4, 0), (x, -1.4, 0), 0.06, 4)
        x = nx
        flip *= -1
    # A-frame and tie cables
    apex = (0, 0, jib_h + 12)
    add_beam(bm, (0, 1.2, jib_h), apex, 0.18)
    add_beam(bm, (0, -1.2, jib_h), apex, 0.18)
    add_beam(bm, apex, (jib_len - 4, 0, jib_h), 0.05, 4)
    add_beam(bm, apex, (-back_len + 2, 0, jib_h), 0.05, 4)
    # cab, counterweight, hook line
    add_box(bm, (1.5, 0, jib_h - 2.6), (3.4, 2.4, 2.6))
    add_box(bm, (-back_len + 2.0, 0, jib_h - 0.6), (4.0, 3.2, 3.2))
    add_beam(bm, (44, 0, 0), (44, 0, -22), 0.04, 4)
    add_box(bm, (44, 0, -23.2), (1.6, 1.0, 1.4))
    finish("crane_jib", bm, m_gold, (cx, cy, crane_h))

    # ---- trucks -----------------------------------------------------------------
    for name, loc, yaw in (("truck_a", (30.0, -50.0, 0.0), 0.0), ("truck_b", (-12.0, 52.0, 0.0), math.pi)):
        bm = bmesh.new()
        add_box(bm, (0, 0, 1.9), (9.0, 2.5, 2.4))
        add_box(bm, (5.4, 0, 1.6), (2.2, 2.5, 3.0))
        for wx in (-3.2, -1.0, 4.6):
            for wy in (-1.25, 1.25):
                bmesh.ops.create_cone(
                    bm, cap_ends=True, cap_tris=False, segments=10, radius1=0.6, radius2=0.6, depth=0.4,
                    matrix=Matrix.Translation((wx, wy, 0.6)) @ Matrix.Rotation(math.pi / 2, 4, "X"),
                )
        ob = finish(name, bm, m_truck, loc)
        ob.rotation_euler = (0, 0, yaw)

    # ---- site fence -------------------------------------------------------------
    bm = bmesh.new()
    fw, fd = 100.0, 80.0
    run = [(-fw / 2, -fd / 2), (fw / 2, -fd / 2), (fw / 2, fd / 2), (-fw / 2, fd / 2)]
    for k in range(4):
        a, b = Vector((*run[k], 0)), Vector((*run[(k + 1) % 4], 0))
        length = (b - a).length
        steps_n = int(length // 5)
        for s in range(steps_n + 1):
            p = a + (b - a) * (s / steps_n)
            add_beam(bm, (p.x, p.y, 0.2), (p.x, p.y, 2.2), 0.08, 4)
        add_beam(bm, (a.x, a.y, 2.0), (b.x, b.y, 2.0), 0.05, 4)
        add_beam(bm, (a.x, a.y, 1.0), (b.x, b.y, 1.0), 0.05, 4)
    finish("site_fence", bm, m_dark)

    # ---- trees ------------------------------------------------------------------
    bm = bmesh.new()
    for _ in range(24):
        ang = random.uniform(0, 2 * math.pi)
        rad = random.uniform(58, 78)
        x, y = rad * math.cos(ang) * 0.9, rad * math.sin(ang) * 0.75
        h = random.uniform(5, 9)
        add_beam(bm, (x, y, 0.2), (x, y, 0.2 + h * 0.4), 0.18, 5)
        add_cone(bm, (x, y, 0.2 + h * 0.3), h * 0.34, h * 0.7, 7)
    finish("trees", bm, m_tree)

    # ---- neighbours (context) ---------------------------------------------------
    bm = bmesh.new()
    placed = 0
    attempts = 0
    while placed < 9 and attempts < 200:
        attempts += 1
        ang = random.uniform(0, 2 * math.pi)
        rad = random.uniform(108, 142)
        x, y = rad * math.cos(ang), rad * math.sin(ang)
        if abs(x) < 70 and abs(y) < 60:
            continue
        bw, bd, bh = random.uniform(14, 26), random.uniform(14, 24), random.uniform(10, 36)
        add_box(bm, (x, y, bh / 2), (bw, bd, bh))
        placed += 1
    finish("neighbors", bm, m_context)

    return bpy.context.scene


# --------------------------------------------------------------------------
# Export and preview
# --------------------------------------------------------------------------
def export(path):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_image_format="NONE",
        export_cameras=False,
        export_lights=False,
        export_draco_mesh_compression_enable=False,
    )


def preview(path):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1000
    scene.render.filepath = path
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.96, 0.96, 0.95, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.1
    scene.world = world
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.2
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    bpy.context.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = 34
    cam.location = (190, -250, 120)
    direction = Vector((0, 0, 50)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    opts = args()
    build()
    export(opts["glb"])
    if opts["preview"]:
        preview(opts["preview"])
    print("DONE", opts["glb"])
