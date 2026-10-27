CREATE TABLE "company_overviews" (
	"org_id" text NOT NULL,
	"company_id" integer NOT NULL,
	"conteudo" jsonb NOT NULL,
	"fontes" jsonb NOT NULL,
	"modelo" text NOT NULL,
	"gerado_por" text,
	"gerado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_overviews_org_id_company_id_pk" PRIMARY KEY("org_id","company_id")
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "site_titulo" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "site_descricao" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "linkedin" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "instagram" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "site_coletado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "company_overviews" ADD CONSTRAINT "company_overviews_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_overviews" ADD CONSTRAINT "company_overviews_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_overviews" ADD CONSTRAINT "company_overviews_gerado_por_users_id_fk" FOREIGN KEY ("gerado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;