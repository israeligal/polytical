CREATE TABLE "group_stance_consent" (
	"groupId" uuid NOT NULL,
	"userId" text NOT NULL,
	"consentedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "group_stance_consent_groupId_userId_pk" PRIMARY KEY("groupId","userId")
);
--> statement-breakpoint
ALTER TABLE "group_stance_consent" ADD CONSTRAINT "group_stance_consent_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_stance_consent" ADD CONSTRAINT "group_stance_consent_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_stance_consent_user_idx" ON "group_stance_consent" USING btree ("userId");