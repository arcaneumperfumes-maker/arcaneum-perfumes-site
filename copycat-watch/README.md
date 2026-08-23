# ARCANEUM Copycat Watch

This folder is the controlled baseline for detecting copied ARCANEUM brand assets. It protects exact signature phrases, exact image files, the canonical site fingerprint, lookalike domains, and public repository phrase matches.

The scheduled workflow runs every Friday and can also be started manually. It uploads a JSON evidence report without modifying the website or contacting third parties. Add known suspect pages to `watch_urls` in `config.json`, or set the repository variable `COPYCAT_WATCH_URLS` to a comma-separated URL list, to scan those pages for exact phrase and image matches.

This is a detection and evidence foundation, not a legal conclusion. Review each finding before sending a notice or making a public claim.
