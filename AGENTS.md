The role of this file is to describe common mistakes and confusion points that agents might encounter as they work in this project. If you ever encounter something in the project that surprises you, please alert the developer working with you and indicate that this is the case in the AgentMD file to help prevent future agents from having the same issue.

## Known workspace gaps

- `npm run test:ui-spec` currently expects `docs/ui-spec/manifest.yaml`, but `docs/ui-spec/` is absent from this checkout. Treat the resulting `FileNotFoundError` as a missing test fixture/spec package, not as a frontend or backend regression.

## Local room lifecycle

- `backend/app.py` intentionally closes every active room with `closeReason: "server_restart"` during process startup. Do not restart the local backend while a test or user room must remain usable unless recovery or replacement of that room is explicitly part of the work.
