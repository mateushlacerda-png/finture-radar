ALTER TABLE "companies" ADD COLUMN "entrou_em" text;--> statement-breakpoint
CREATE INDEX "companies_entrou_em_idx" ON "companies" USING btree ("entrou_em");