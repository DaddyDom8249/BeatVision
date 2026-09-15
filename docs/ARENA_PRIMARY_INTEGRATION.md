# BeatVision Arena Primary Integration

BeatVision Arena remains a separate repository and provider execution laboratory. The original BeatVision application may use its versioned gateway as the primary creative execution path without copying or modifying Arena source.

Primary path:

Song → Analyze → Reveal World → Approve/Lock World → World Assets → Storyboard → Scene Images → Motion Jobs → Shotstack Assembly → Preview/Export.

Arena-backed operations use contract 1.1 and server-side credentials only.

Other provider implementations remain available as optional integration adapters. They are not the default execution path.

Required server secrets/configuration in the BeatVision deployment:
- ARENA_GATEWAY_URL
- ARENA_GATEWAY_TOKEN

The browser must never receive provider credentials.
