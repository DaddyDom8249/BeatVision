# Orchestration/provider evidence

Status: AUDITED / REPRODUCED / IMPLEMENTED / TESTED.
Repair: drain queued and active jobs through separate bounded queries so active provider work cannot starve queued jobs. Focused generation checks 39/39 pass; full suite/build/audit pass. No provider calls, scheduler production mutation, or paid/unknown-cost execution performed.
