import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabase";

// Catégories de dépenses / revenus.
export function useFinanceCategories(userId) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from("finance_categories").select("*")
      .eq("user_id", userId).eq("archived", false).order("sort_order");
    setCategories(data || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  const createCategory = async ({ name, kind = "depense", color = null, icon = null }) => {
    const siblings = categories.filter(c => c.kind === kind);
    const { data, error } = await supabase.from("finance_categories").insert({
      user_id: userId, name, kind, color, icon, sort_order: siblings.length,
    }).select().single();
    if (error) { console.error("createCategory error:", error); return null; }
    if (data) setCategories(c => [...c, data]);
    return data;
  };

  const updateCategory = async (id, patch) => {
    const { data, error } = await supabase.from("finance_categories")
      .update(patch).eq("id", id).select().single();
    if (error) { console.error("updateCategory error:", error); return null; }
    if (data) setCategories(c => c.map(x => x.id === id ? data : x));
    return data;
  };

  const archiveCategory = async (id) => {
    await supabase.from("finance_categories").update({ archived: true }).eq("id", id);
    setCategories(c => c.filter(x => x.id !== id));
  };

  const reorderCategories = async (orderedIds) => {
    setCategories(prev => {
      const map = {}; orderedIds.forEach((id, i) => { map[id] = i; });
      return prev.map(c => c.id in map ? { ...c, sort_order: map[c.id] } : c)
        .sort((a, b) => a.sort_order - b.sort_order);
    });
    await Promise.all(orderedIds.map((id, i) =>
      supabase.from("finance_categories").update({ sort_order: i }).eq("id", id)
    ));
  };

  const byKind = (kind) => categories.filter(c => c.kind === kind);

  return { categories, byKind, loading, createCategory, updateCategory, archiveCategory, reorderCategories, refetch: fetch };
}
