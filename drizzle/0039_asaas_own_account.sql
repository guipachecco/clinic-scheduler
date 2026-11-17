ALTER TYPE "public"."asaas_account_status" ADD VALUE 'disconnected';--> statement-breakpoint
ALTER TABLE "asaas_accounts" ALTER COLUMN "account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "asaas_accounts" ADD COLUMN "account_name" text;--> statement-breakpoint
ALTER TABLE "asaas_accounts" ADD CONSTRAINT "asaas_accounts_wallet_unique" UNIQUE("wallet_id");