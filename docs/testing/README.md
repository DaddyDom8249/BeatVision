# Testing

## Unit
- prompt construction
- schema validation
- state transitions
- provider normalization
- database helpers

## Integration
- World Report persistence
- Style Bible persistence
- Storyboard persistence
- scene batch accumulation
- approval persistence
- motion jobs
- final video records

## E2E
1. Create project
2. Generate World Report
3. Refresh and verify persistence
4. Generate storyboard chunks
5. Generate multiple image batches
6. Approve assets
7. Generate later batches and verify earlier assets remain
8. Run motion and verify processing is not treated as failure
9. Assemble final video
10. Refresh and verify persistence
