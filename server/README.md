Simple server that takes requests from the extension and runs the needed yt-dlp command.

Completed downloads are appended as JSON Lines to `../ui-for-yt-dlp.log`. Each
line contains `datetime`, `url`, `status`, `statusCode`, `playlist`, `album`,
`title`, and `file`. A `statusCode` of `0` means the item completed; a non-zero
code means it failed. Playlist and album downloads produce one line per item.
The backend console also reports completion progress, for example
`[download] Finished song 3 of 12 (Album): Track title`.

`GET /stats?limit=20` streams the log server-side, caches the aggregate, and
returns totals plus only the requested number of recent successful and failed
records. The response is capped at 100 records per category.
