-- Create comprehensive search indexes for optimal query performance

-- Full-text search indexes using GIN for text content
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_name_gin 
ON documents USING gin(to_tsvector('english', name));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_extracted_text_gin 
ON documents USING gin(to_tsvector('english', extracted_text));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_summary_gin 
ON documents USING gin(to_tsvector('english', summary));

-- Composite indexes for common filter combinations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_user_category 
ON documents(user_id, category_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_user_uploaded_at 
ON documents(user_id, uploaded_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_user_expiry 
ON documents(user_id, expiry_date) WHERE expiry_date IS NOT NULL;

-- B-tree indexes for exact matches and sorting
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_mime_type 
ON documents(mime_type);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_file_size 
ON documents(file_size);

-- Index for tag searches (if using array column)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_tags_gin 
ON documents USING gin(tags);

-- Partial indexes for common filtered queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_recent 
ON documents(user_id, uploaded_at DESC) 
WHERE uploaded_at > (CURRENT_DATE - INTERVAL '30 days');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_expiring_soon 
ON documents(user_id, expiry_date) 
WHERE expiry_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days');

-- Category table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_categories_user_name 
ON categories(user_id, name);

-- Search optimization - materialized search fields
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Update search vector for existing documents
UPDATE documents 
SET search_vector = to_tsvector('english', 
  COALESCE(name, '') || ' ' || 
  COALESCE(extracted_text, '') || ' ' || 
  COALESCE(summary, '')
) WHERE search_vector IS NULL;

-- Index the search vector
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_search_vector 
ON documents USING gin(search_vector);

-- Function to automatically update search vector
CREATE OR REPLACE FUNCTION update_documents_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    COALESCE(NEW.name, '') || ' ' ||
    COALESCE(NEW.extracted_text, '') || ' ' ||
    COALESCE(NEW.summary, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update search vector
DROP TRIGGER IF EXISTS trg_update_documents_search_vector ON documents;
CREATE TRIGGER trg_update_documents_search_vector
  BEFORE INSERT OR UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_documents_search_vector();

-- Analyze tables for query planner optimization
ANALYZE documents;
ANALYZE categories;

