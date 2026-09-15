# BeatVision Media Integrity Skill

Adapted from Arena's validated media and coverage rules for the original BeatVision data model.

## Production media identity

A scene image or motion asset must have a durable identity and provenance. At minimum, associate it with its project and scene, and record provider/job/source information where the schema supports it.

## Anti-recycling rule

Repeated use of an asset is not automatically invalid, but it must be explicit. A repeated asset must carry a traceable reuse relationship or an intentional version/continuity reason. Accidental reuse is a defect.

## Coverage rule

Final assembly must cover the actual uploaded song duration. Do not extend a short set of unique visuals by silently looping them and calling the result complete.

## Timeline rule

Scenes must be ordered, deterministic, non-overlapping, and gap-free within a small numerical tolerance. Coverage must be derived from the actual song duration rather than an arbitrary assumed duration.

## Provider fallback rule

Fallback motion such as deterministic camera movement may be used only when the product explicitly permits it and the resulting asset is labeled as fallback. It must never masquerade as generative video.
