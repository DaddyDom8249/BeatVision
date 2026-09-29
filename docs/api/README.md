# API responsibilities

## beatvision-generate
Auth, validation, project context, generation request, provider call, response validation, durable persistence.

## beatvision-pipeline
Orchestrates world → characters → style bible → environments → storyboard without destroying completed stages.

## beatvision-storyboard
Generates storyboard chunks and preserves existing scenes.

## beatvision-arena
Secure provider gateway. Authenticates, validates capability, routes provider, normalizes response.
