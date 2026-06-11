"use client";

import type { PoliticianOption } from "@/lib/types";
import { searchPoliticiansAction } from "@/app/actions/admin-markets";
import { PoliticianCombobox } from "@/components/politician-combobox";

/**
 * Admin-console politician autocomplete. Thin wrapper over the shared
 * PoliticianCombobox, passing the admin-gated search action. Call sites that
 * already import PoliticianPicker continue to work unchanged.
 */
export function PoliticianPicker({
  value,
  onChange,
  placeholder = "חיפוש לפי שם…",
}: {
  value: PoliticianOption | null;
  onChange: (next: PoliticianOption | null) => void;
  placeholder?: string;
}) {
  return (
    <PoliticianCombobox
      value={value}
      onChange={onChange}
      search={searchPoliticiansAction}
      placeholder={placeholder}
      showPersonId
    />
  );
}
