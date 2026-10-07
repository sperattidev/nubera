DROP INDEX "stations_tenant_slug_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "stations_slug_idx" ON "stations" USING btree ("slug");