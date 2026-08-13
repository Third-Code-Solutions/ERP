# WO-06 canonical DUPA math contradiction

## Status

BLOCKED for canonical sign-off. The implementation must not invent a rounding
exception or silently alter the listed source rates.

## Evidence

The authority documents require the worked example to return:

- `G = 1,621,750` centavos
- `H = 16,217,500` centavos

Using the same documents' listed inputs as exact centavo values:

- Material: `595,100` centavos
- Labour: `27,202 + 19,909 + (2 × 17,379) = 81,869` centavos
- Equipment: `60,000 / 0.10 = 600,000` centavos
- Direct: `1,276,969` centavos
- Indirect: `15% × direct = 191,545.35` centavos
- VAT: `12% × direct = 153,236.28` centavos
- Exact total before persistence rounding: `1,621,750.63` centavos
- Required half-up result from those inputs: `G = 1,621,751`, `H = 16,217,506`

The PRD's intermediate labour value `818.685` PHP implies at least one
source-precision rate that is not represented by the listed two-decimal rates;
for example, the non-skilled rate would need to be `173.7875` PHP to produce
that intermediate. That conflicts with the locked BIGINT-centavo rate model.

## Required owner decision

ABI must provide either:

1. the source-precision rates from the MNHPI workbook and permission to model
   that precision explicitly before centavo persistence; or
2. confirmation that the displayed two-decimal rates are authoritative, in
   which case the canonical expected values must change to `G=1,621,751` and
   `H=16,217,506`.

Until resolved, the exact engine remains local-only and WO-06 is not complete.
