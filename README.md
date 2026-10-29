# Option Dashboard

A dashboard for TSETMC options market.

## Setup
1. Point your web server to the root of this project.
2. Ensure `data/` and `logs/` directories are writable by the web server.

## Data Collection
Run `php collector/fetch.php` via cron job during market hours.
Example:
`* 9-15 * * 0-3 php /path/to/collector/fetch.php`

## Price Mode
The API accepts `?price=last` or `?price=exec` to change the basis for strategy calculations.
- `last`: Uses the last traded price.
- `exec`: Uses the executable bid/ask price depending on buy/sell action.
