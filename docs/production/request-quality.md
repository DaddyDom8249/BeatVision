# Production request checks

The artist directs. The application must not invent missing render instructions.
An AI proposal is a proposal until the artist reviews it; generated imagery is
not evidence that a factual claim, identity or continuity condition is correct.

## Enforced motion checks

1. **Approved source and lineage:** existing server ownership, project, plan,
   scene, source approval, private path and byte fingerprint checks remain
   authoritative. The Vision Lock and immutable job snapshot supply the source.
2. **Direction:** one compact actor direction and at most one camera direction.
   The review UI and server dispatch share `shot-direction.ts`. Escaped JSON is
   decoded as JSON. Missing/malformed input, explicit alternatives, overlong
   clauses and known generic global movement are blocked before submission.
   Global occasional variations are not applied to every short shot. Image
   appearance replaces lists of possible locations or whole-song style stages.
   Drafts may be saved incomplete; incomplete direction cannot render.
3. **Submission contract:** source bytes, IDs, model/revision, frame bounds,
   credentials, spending enablement and terms retain their existing checks.
   The worker's strict actual-tokenizer budget check rejects requests that would
   otherwise lose instructions through truncation before calling the pipeline.

Successful new application submissions record the application prompt (before the
worker's mandatory preservation prefix/token accounting), source ID/fingerprint,
frame count, policy version and passed application checks. Visual quality and
visual continuity explicitly remain **unverified**. These are not aesthetic or
semantic truth scores. A valid file is not a quality-approved video.

## Artist workflow

The Visual Plan editor previews the compact motion request from current edits
before saving. The production screen lists saved request previews and issues.
Blocked directions disable bulk motion start/resume; the server also rejects
invalid input regardless of which UI invokes it. Approved plans are revised
through the existing editable-revision flow; do not mutate locked creative state,
replace approved assets or automatically approve generated output.

## Verification limits

This implementation tightens the motion request stage. It does not certify every
World/Style/character/story proposal, guarantee that a generative model follows
its prompt, establish facial consistency from a checksum, or prove final-video
continuity. Those stages require their own traceable proposals, validation and
artist review. Improved real video needs a bounded, authorized generation and
visual comparison before bulk resumption. No automatic retries or paid fallback.
