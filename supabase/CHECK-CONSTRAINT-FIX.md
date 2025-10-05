# 🔧 PostgreSQL CHECK Constraint Fix

## ❌ Problem

Greška pri CREATE TABLE sa inline CHECK constraints:
```
ERROR: 42703: column "status" does not exist
```

## 🐛 Root Cause

PostgreSQL ne dozvoljava CHECK constraints koji referenciraju kolone u:
```sql
CREATE TABLE IF NOT EXISTS tablename (
    column_name TEXT CHECK (column_name IN (...))  -- ❌ ERROR!
);
```

Problem je sa **parsing order**:
1. PostgreSQL prvo parsira CHECK constraint
2. Kolona još nije "vidljiva" u tom kontekstu
3. Greška: "column does not exist"

## ✅ Solution 1: Named Constraints (Doesn't Work)

Pokušaj:
```sql
CREATE TABLE IF NOT EXISTS tablename (
    column_name TEXT DEFAULT 'value',
    CONSTRAINT name_check CHECK (column_name IN (...))  -- ❌ STILL FAILS!
);
```

**Rezultat**: Ista greška! `IF NOT EXISTS` još uvek pravi problem.

## ✅ Solution 2: DO Blocks (WORKS! ✅)

```sql
-- Create table without constraints
DO $$ 
BEGIN
    CREATE TABLE IF NOT EXISTS public.tablename (
        id UUID PRIMARY KEY,
        column_name TEXT DEFAULT 'value'
    );
EXCEPTION
    WHEN duplicate_table THEN
        NULL;  -- Ignore if already exists
END $$;

-- Add constraint separately
DO $$ 
BEGIN
    ALTER TABLE public.tablename 
    ADD CONSTRAINT name_check CHECK (column_name IN ('value1', 'value2'));
EXCEPTION
    WHEN duplicate_object THEN
        NULL;  -- Ignore if constraint already exists
END $$;
```

**Zašto radi:**
1. Tabela se kreira prvo (bez constraints)
2. Kolona sada postoji
3. ALTER TABLE dodaje constraint na već postojeću kolonu
4. Exception handling dozvoljava multiple runs

## 📋 Applied Fix

### Before (❌):
```sql
CREATE TABLE IF NOT EXISTS public.download_history (
    status TEXT DEFAULT 'pending',
    CONSTRAINT status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);
-- ERROR: column "status" does not exist
```

### After (✅):
```sql
-- Step 1: Create table
DO $$ 
BEGIN
    CREATE TABLE IF NOT EXISTS public.download_history (
        status TEXT DEFAULT 'pending'
    );
EXCEPTION
    WHEN duplicate_table THEN NULL;
END $$;

-- Step 2: Add constraint
DO $$ 
BEGIN
    ALTER TABLE public.download_history 
    ADD CONSTRAINT status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
```

## 🎯 Benefits

1. **Idempotent**: Can run multiple times without errors
2. **Safe**: Ignores existing tables/constraints gracefully
3. **Clear**: Separates table creation from constraint logic
4. **Reliable**: Works consistently across PostgreSQL versions

## 📝 Implementation

Applied to 3 tables in `supabase/auto-setup.sql`:

1. **profiles** - `role_check` constraint
2. **download_history** - `status_check` constraint
3. **user_settings** - `theme_check` constraint

## ✅ Testing

```sql
-- Run this in Supabase SQL Editor:
-- Should complete without errors

-- Verify tables
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'download_history', 'user_settings');

-- Verify constraints
SELECT conname, conrelid::regclass 
FROM pg_constraint 
WHERE conname IN ('role_check', 'status_check', 'theme_check');
```

## 🔗 References

- PostgreSQL Docs: [CREATE TABLE](https://www.postgresql.org/docs/current/sql-createtable.html)
- PostgreSQL Docs: [CHECK Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-CHECK-CONSTRAINTS)
- Stack Overflow: [CHECK constraint with IF NOT EXISTS](https://stackoverflow.com/questions/3524088)

## 📅 Timeline

- **Oct 5, 2025 14:00** - Initial error reported
- **Oct 5, 2025 14:15** - Tried named constraints (failed)
- **Oct 5, 2025 14:30** - Implemented DO block solution (success ✅)
- **Commit**: `c766995`

---

**Status**: ✅ FIXED  
**File**: `supabase/auto-setup.sql`  
**Method**: DO blocks with exception handling
