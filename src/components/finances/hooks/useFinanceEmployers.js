import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabase";
import { setFinanceError } from "./financeError";

// Employeurs — permettent un salaire cumulé sur plusieurs sources distinctes.
export function useFinanceEmployers(userId) {
  const [employers, setEmployers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase.from("finance_employers").select("*")
      .eq("user_id", userId).eq("archived", false).order("sort_order");
    // La table n'existe pas tant que la migration 010 n'est pas appliquée :
    // on dégrade en liste vide plutôt que de casser tout le module Finances.
    if (error) { setFinanceError("fetchEmployers:", error); setEmployers([]); setLoading(false); return;  }
    setEmployers(data || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  const createEmployer = async ({ name, color = null }) => {
    const { data, error } = await supabase.from("finance_employers").insert({
      user_id: userId, name, color, sort_order: employers.length,
    }).select().single();
    if (error) { setFinanceError("createEmployer:", error); return null;  }
    if (data) setEmployers(e => [...e, data]);
    return data;
  };

  const updateEmployer = async (id, patch) => {
    const { data, error } = await supabase.from("finance_employers")
      .update(patch).eq("id", id).select().single();
    if (error) { setFinanceError("updateEmployer:", error); return null;  }
    if (data) setEmployers(e => e.map(x => x.id === id ? data : x));
    return data;
  };

  // Archivage et non suppression : les transactions gardent leur employer_id,
  // donc l'historique du dashboard reste juste.
  const archiveEmployer = async (id) => {
    const { error } = await supabase.from("finance_employers").update({ archived: true }).eq("id", id);
    if (error) { setFinanceError("archiveEmployer:", error); return false;  }
    setEmployers(e => e.filter(x => x.id !== id));
    return true;
  };

  return { employers, loading, createEmployer, updateEmployer, archiveEmployer, refetch: fetch };
}
