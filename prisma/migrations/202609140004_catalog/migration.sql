ALTER TABLE products ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 ADD COLUMN "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
 ADD COLUMN "updatedAt" timestamptz(3) NOT NULL DEFAULT now();
ALTER TABLE categories ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 ADD COLUMN "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
 ADD COLUMN "updatedAt" timestamptz(3) NOT NULL DEFAULT now();
-- Preserve identifiers exactly (including leading zeroes); category names ignore case.
CREATE UNIQUE INDEX categories_name_folded ON categories (lower(trim(name)));
ALTER TABLE categories ADD CHECK (length(trim(name)) BETWEEN 1 AND 120);
ALTER TABLE products ADD CHECK (length(trim(name)) BETWEEN 1 AND 160 AND length(trim(code)) BETWEEN 1 AND 64);
