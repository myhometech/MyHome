CREATE TABLE "blog_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"excerpt" text NOT NULL,
	"content" text NOT NULL,
	"featured_image" varchar(255),
	"author_id" varchar NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp,
	"tags" text[],
	"read_time_minutes" integer DEFAULT 5,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "blog_posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar(50) NOT NULL,
	"icon" varchar(50) NOT NULL,
	"color" varchar(20) NOT NULL,
	CONSTRAINT "unique_category_per_user" UNIQUE("user_id","name")
);
--> statement-breakpoint
CREATE TABLE "document_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"insight_id" varchar NOT NULL,
	"message" text NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" varchar NOT NULL,
	"content" text NOT NULL,
	"confidence" integer NOT NULL,
	"priority" varchar(10) DEFAULT 'medium' NOT NULL,
	"due_date" date,
	"action_url" text,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"metadata" jsonb,
	"processing_time" integer,
	"ai_model" varchar(50) DEFAULT 'gpt-4o',
	"source" varchar(20) DEFAULT 'ai',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "unique_insight_per_document" UNIQUE("document_id","insight_id")
);
--> statement-breakpoint
CREATE TABLE "document_shares" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"shared_by_user_id" varchar NOT NULL,
	"shared_with_email" varchar(255) NOT NULL,
	"shared_with_user_id" varchar,
	"permissions" varchar(20) DEFAULT 'view' NOT NULL,
	"shared_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"category_id" integer,
	"name" varchar(255) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_path" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"tags" text[],
	"expiry_date" timestamp,
	"extracted_text" text,
	"summary" text,
	"ocr_processed" boolean DEFAULT false,
	"encrypted_document_key" text,
	"encryption_metadata" text,
	"is_encrypted" boolean DEFAULT true,
	"uploaded_at" timestamp DEFAULT now(),
	"gcs_path" text,
	"upload_source" varchar(20) DEFAULT 'manual',
	"status" varchar(20) DEFAULT 'active',
	"categorization_source" varchar(20) DEFAULT 'rules'
);
--> statement-breakpoint
CREATE TABLE "email_forwards" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"from_email" varchar(255) NOT NULL,
	"subject" text NOT NULL,
	"email_body" text,
	"has_attachments" boolean DEFAULT false,
	"attachment_count" integer DEFAULT 0,
	"processed_at" timestamp DEFAULT now(),
	"documents_created" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "expiry_reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"document_id" integer,
	"title" varchar NOT NULL,
	"description" text,
	"expiry_date" timestamp NOT NULL,
	"reminder_date" timestamp NOT NULL,
	"category" varchar,
	"source" varchar(20) DEFAULT 'manual',
	"status" varchar(20) DEFAULT 'pending',
	"is_completed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "llm_usage_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"user_id" varchar,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"tokens_used" integer NOT NULL,
	"cost_usd" numeric(10, 4),
	"duration_ms" integer,
	"status" text NOT NULL,
	"route" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_webhooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" varchar NOT NULL,
	"event_type" varchar NOT NULL,
	"processed_at" timestamp DEFAULT now(),
	"data" jsonb NOT NULL,
	CONSTRAINT "stripe_webhooks_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "user_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(20) NOT NULL,
	"address" text,
	"postcode" varchar(20),
	"make" varchar(100),
	"model" varchar(100),
	"year" integer,
	"registration" varchar(50),
	"vin" varchar(50),
	"estimated_value" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_forwarding_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"email_hash" varchar(20) NOT NULL,
	"forwarding_address" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "user_forwarding_mappings_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "user_forwarding_mappings_email_hash_unique" UNIQUE("email_hash"),
	CONSTRAINT "user_forwarding_mappings_forwarding_address_unique" UNIQUE("forwarding_address")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"password_hash" varchar,
	"auth_provider" varchar(20) DEFAULT 'email' NOT NULL,
	"provider_id" varchar,
	"role" varchar(20) DEFAULT 'user' NOT NULL,
	"subscription_tier" varchar(20) DEFAULT 'free' NOT NULL,
	"stripe_customer_id" varchar,
	"subscription_status" varchar(20) DEFAULT 'inactive',
	"subscription_id" varchar,
	"subscription_renewal_date" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "unique_provider_account" UNIQUE("auth_provider","provider_id"),
	CONSTRAINT "unique_email_account" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "feature_flag_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"feature_flag_name" text NOT NULL,
	"was_enabled" boolean NOT NULL,
	"evaluation_reason" text NOT NULL,
	"user_tier" text NOT NULL,
	"session_id" text,
	"user_agent" text,
	"ip_address" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flag_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"feature_flag_id" uuid NOT NULL,
	"is_enabled" boolean NOT NULL,
	"override_reason" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"tier_required" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"rollout_strategy" text DEFAULT 'tier_based' NOT NULL,
	"rollout_percentage" integer DEFAULT 100,
	"rollout_config" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "feature_flags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_insights" ADD CONSTRAINT "document_insights_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_insights" ADD CONSTRAINT "document_insights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_shared_by_user_id_users_id_fk" FOREIGN KEY ("shared_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_shared_with_user_id_users_id_fk" FOREIGN KEY ("shared_with_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_forwards" ADD CONSTRAINT "email_forwards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expiry_reminders" ADD CONSTRAINT "expiry_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expiry_reminders" ADD CONSTRAINT "expiry_reminders_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_usage_logs" ADD CONSTRAINT "llm_usage_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_assets" ADD CONSTRAINT "user_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_forwarding_mappings" ADD CONSTRAINT "user_forwarding_mappings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_feature_flag_id_feature_flags_id_fk" FOREIGN KEY ("feature_flag_id") REFERENCES "public"."feature_flags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_blog_posts_published" ON "blog_posts" USING btree ("published");--> statement-breakpoint
CREATE INDEX "idx_blog_posts_slug" ON "blog_posts" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_blog_posts_author" ON "blog_posts" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "idx_categories_user" ON "categories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_document_insights_document" ON "document_insights" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_document_insights_user" ON "document_insights" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_document_insights_type" ON "document_insights" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_document_insights_priority" ON "document_insights" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "idx_insights_user_status" ON "document_insights" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_insights_due_date" ON "document_insights" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "idx_document_shares_document" ON "document_shares" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_document_shares_shared_with" ON "document_shares" USING btree ("shared_with_user_id");--> statement-breakpoint
CREATE INDEX "idx_documents_user_id" ON "documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_documents_user_category" ON "documents" USING btree ("user_id","category_id");--> statement-breakpoint
CREATE INDEX "idx_documents_user_uploaded" ON "documents" USING btree ("user_id","uploaded_at");--> statement-breakpoint
CREATE INDEX "idx_documents_name_search" ON "documents" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_documents_filename_search" ON "documents" USING btree ("file_name");--> statement-breakpoint
CREATE INDEX "idx_documents_tags_gin" ON "documents" USING btree ("tags");--> statement-breakpoint
CREATE INDEX "idx_documents_expiry" ON "documents" USING btree ("expiry_date");--> statement-breakpoint
CREATE INDEX "idx_documents_ocr_status" ON "documents" USING btree ("ocr_processed");--> statement-breakpoint
CREATE INDEX "idx_email_forwards_user" ON "email_forwards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_email_forwards_status" ON "email_forwards" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_expiry_reminders_user" ON "expiry_reminders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_expiry_reminders_document" ON "expiry_reminders" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_expiry_reminders_status" ON "expiry_reminders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_expiry_reminders_source" ON "expiry_reminders" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_llm_usage_created_at" ON "llm_usage_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_llm_usage_user_id" ON "llm_usage_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_llm_usage_model" ON "llm_usage_logs" USING btree ("model");--> statement-breakpoint
CREATE INDEX "idx_llm_usage_provider" ON "llm_usage_logs" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "idx_llm_usage_status" ON "llm_usage_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "idx_user_assets_user" ON "user_assets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_assets_type" ON "user_assets" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_user_forwarding_hash" ON "user_forwarding_mappings" USING btree ("email_hash");