# Security

Lineage runs fully offline: the app makes no network requests and has no
server. The parts most worth a report are the ones that read files someone
else wrote: the `.flow.yaml` parser, the code reader, the layout file import
and the VS Code extension.

## Reporting a problem

Please do not open a public issue. Use **Security → Report a vulnerability**
on this repository's GitHub page, which sends the report privately.

Say what you did, what happened and what you expected. A small `.flow.yaml`
or code sample that shows the problem helps most.

Only the latest commit on `main` is supported.
