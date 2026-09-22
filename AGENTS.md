# Custom Agent Instructions

Whenever changes are made to the database schema or status definitions within the application:
1. Ensure the PostgreSQL schema under `supabase/schema.sql` is updated to remain fully in sync.
2. Provide explicit SQL migration instructions so modifications can easily be applied to the active production Supabase database.
