CREATE TYPE "public"."group_member_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."group_member_status" AS ENUM('active', 'left');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'group_motion_posted';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'group_motion_resolved';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'group_mention';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'group_member_joined';--> statement-breakpoint
CREATE TABLE "group_members" (
	"groupId" uuid NOT NULL,
	"userId" text NOT NULL,
	"role" "group_member_role" DEFAULT 'member' NOT NULL,
	"status" "group_member_status" DEFAULT 'active' NOT NULL,
	"groupWins" integer DEFAULT 0 NOT NULL,
	"groupResolved" integer DEFAULT 0 NOT NULL,
	"joinedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "group_members_groupId_userId_pk" PRIMARY KEY("groupId","userId")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"nameHe" text NOT NULL,
	"descriptionHe" text,
	"emblem" text,
	"colorToken" text,
	"ownerId" text NOT NULL,
	"inviteCode" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "groups_slug_unique" UNIQUE("slug"),
	CONSTRAINT "groups_inviteCode_unique" UNIQUE("inviteCode")
);
--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN "groupId" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "refGroupId" uuid;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "defaultGroupId" uuid;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_ownerId_user_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_members_board_idx" ON "group_members" USING btree ("groupId","groupWins");--> statement-breakpoint
CREATE INDEX "group_members_user_idx" ON "group_members" USING btree ("userId");--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "markets_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_defaultGroupId_groups_id_fk" FOREIGN KEY ("defaultGroupId") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "markets_group_idx" ON "markets" USING btree ("groupId","status","createdAt");