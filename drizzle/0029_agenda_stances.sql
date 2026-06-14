CREATE TABLE "agenda_stances" (
	"userId" text NOT NULL,
	"agendaItemId" uuid NOT NULL,
	"stance" "user_stance" NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agenda_stances_userId_agendaItemId_pk" PRIMARY KEY("userId","agendaItemId")
);
--> statement-breakpoint
ALTER TABLE "agenda_stances" ADD CONSTRAINT "agenda_stances_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_stances" ADD CONSTRAINT "agenda_stances_agendaItemId_agenda_items_id_fk" FOREIGN KEY ("agendaItemId") REFERENCES "public"."agenda_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agenda_stances_item_idx" ON "agenda_stances" USING btree ("agendaItemId");--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_items_bill_uq" ON "agenda_items" USING btree ("billId") WHERE "agenda_items"."billId" is not null;