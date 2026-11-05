ALTER TABLE "clinics" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "area_label" text;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "owner_photo_media_id" uuid;--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_owner_photo_media_id_media_id_fk" FOREIGN KEY ("owner_photo_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_display_name_check" CHECK ("clinics"."display_name" is null or char_length("clinics"."display_name") between 1 and 40);--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_area_label_check" CHECK ("clinics"."area_label" is null or char_length("clinics"."area_label") between 1 and 40);