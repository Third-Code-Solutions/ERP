# Document-processing draft BOM pricing contract

## Change

The database integration assertion now matches the implemented safety
boundary: CAD worker recommendations are retained as evidence but do not
become authoritative BOM pricing. A draft created from document processing
must remain unpriced until a DUPA or explicit estimator workflow supplies the
rate.

## Verification

The corrected assertion is covered by the zero-skip API integration workflow
and checks the draft BOM total, line rate source, unit cost, and line total.

## Safety

No production data or hosted configuration was changed. This correction
prevents a test from legitimizing an unsafe automatic commercial commitment.
