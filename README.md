# Lolytee Catering — Admin Dashboard

Staff-only order management dashboard for Lolytee Catering Services.

## What it does

- Staff log in with their own email + password (Supabase Auth)
- View, search, and filter all customer orders in real time
- Add new orders manually (phone/walk-in bookings)
- Update order status (New, Confirmed, In Progress, Completed, Cancelled)
- Automatically signs out after 15 minutes of inactivity
- Orders update live across all logged-in staff, no manual refresh needed

## Tech stack

- React + Vite
- Supabase (database, authentication, row-level security)
- Deployed on Vercel

## Related project

The public-facing ordering website lives in a separate repository: `lolytee-website`.

## Backups

Order data is automatically backed up to CSV every 7 days via a scheduled
GitHub Actions workflow (`.github/workflows/backup-orders.yml`), stored in
the `backups/` folder in this repo.
