# BeatVision No-Fake / Truthfulness Skill

**Source:** distilled from beatvision-grok and Arena media-integrity work, adapted to the original BeatVision architecture.

BeatVision must never report an intended, simulated, placeholder, recycled, or unavailable result as a successful real result.

## Never

- Return placeholder media as generated media.
- Reuse an unrelated scene and call it newly generated.
- Recycle the same asset across scenes without explicit reuse authorization.
- Fabricate provider responses.
- Mark a failed render or generation job complete.
- Pretend audio analysis occurred when it did not.
- Pretend persistence succeeded when data was not durably stored.
- Silently substitute demo data for missing provider output.

## Required provenance

Every production media record should be traceable to:

- project ID
- scene ID
- generation/render job ID
- provider
- model where available
- source/reference information where applicable
- actual stored output

## Success verification

A generation/render operation is successful only after:

1. the provider request completed successfully
2. actual output bytes or a verified durable output exist
3. the output is associated with the requested project/scene/job
4. the output can be loaded or otherwise validated
5. the output is not known placeholder/demo/recycled content

Truthful failure is preferable to a convincing lie. Humans have enough of those already.
