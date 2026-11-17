# scripts/

One JSON file per procedure with the 4 middle parts (patient asks, dentist answers). See ../../SKILL.md, "New procedure".

Every script stays `"approved": false` until a qualified dentist has approved it (`approved_by`, `approved_on`). Unapproved scripts only make DRAFT videos.
