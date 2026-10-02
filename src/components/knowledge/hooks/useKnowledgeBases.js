import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabase";

export function useKnowledgeBases(userId) {
  const [bases, setBases] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    const [{ data: ownedData }, { data: memberships }] = await Promise.all([
      supabase.from("knowledge_bases").select("*").eq("owner_id", userId).eq("is_archived", false).order("position"),
      supabase.from("knowledge_base_members").select("base_id, role").eq("user_id", userId),
    ]);
    const memberMap = {};
    (memberships || []).forEach(m => { memberMap[m.base_id] = m.role; });
    const ownedIds = new Set((ownedData || []).map(b => b.id));
    const directSharedIds = Object.keys(memberMap).filter(id => !ownedIds.has(id));

    // Récursivement expand les sous-bases des bases partagées
    const roleMap = { ...memberMap };
    let allSharedIds = [...directSharedIds];
    let frontier = [...directSharedIds];
    while (frontier.length > 0) {
      const { data: children } = await supabase
        .from("knowledge_bases").select("id, parent_id")
        .in("parent_id", frontier).eq("is_archived", false);
      const newItems = (children || []).filter(c => !allSharedIds.includes(c.id) && !ownedIds.has(c.id));
      if (newItems.length === 0) break;
      newItems.forEach(c => { roleMap[c.id] = roleMap[c.parent_id] || "viewer"; });
      const newIds = newItems.map(c => c.id);
      allSharedIds.push(...newIds);
      frontier = newIds;
    }

    // Fetch toutes les bases partagées (directes + descendants) + _isShared pour owned, en parallèle
    const ownedIdsArr = [...ownedIds];
    const [sharedResult, myMembersResult] = await Promise.all([
      allSharedIds.length > 0
        ? supabase.from("knowledge_bases").select("*").in("id", allSharedIds).eq("is_archived", false)
        : { data: [] },
      ownedIdsArr.length > 0
        ? supabase.from("knowledge_base_members").select("base_id").in("base_id", ownedIdsArr)
        : { data: [] },
    ]);

    const sharedData = sharedResult.data || [];
    const sharedOwnedIds = new Set((myMembersResult.data || []).map(m => m.base_id));

    const all = [
      ...(ownedData || []).map(b => ({ ...b, _isOwner: true, _role: "owner", _isShared: sharedOwnedIds.has(b.id) })),
      ...sharedData.map(b => ({ ...b, _isOwner: false, _role: roleMap[b.id] || "viewer", _isShared: false })),
    ];
    setBases(all);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    const handler = () => fetch();
    window.addEventListener("bases-share-changed", handler);
    return () => window.removeEventListener("bases-share-changed", handler);
  }, [fetch]);

  const createBase = async ({ name, emoji = "📚", color = "#3b82f6", parent_id = null }) => {
    const siblings = bases.filter(b => b.parent_id === parent_id);
    const { data, error } = await supabase.from("knowledge_bases").insert({
      owner_id: userId, name, emoji, color,
      parent_id, position: siblings.length,
    }).select().single();
    if (error) { console.error("createBase error:", error); return null; }
    if (data) setBases(b => [...b, data]);
    return data;
  };

  const updateBase = async (id, patch) => {
    const { data } = await supabase.from("knowledge_bases")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    // Merge : conserver les champs dérivés (_isOwner, _role, _isShared)
    if (data) setBases(b => b.map(x => x.id === id ? { ...x, ...data } : x));
    return data;
  };

  const archiveBase = async (id) => {
    await supabase.from("knowledge_bases").update({ is_archived: true }).eq("id", id);
    setBases(b => b.filter(x => x.id !== id));
  };

  // Helpers dérivés
  const rootBases = bases.filter(b => !b.parent_id);
  const childrenOf = (parentId) => bases.filter(b => b.parent_id === parentId);

  return { bases, rootBases, childrenOf, loading, createBase, updateBase, archiveBase, refetch: fetch };
}
