import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabase";

export function useShareBase(baseId, userId) {
  const [members, setMembers] = useState([]);

  const fetchMembers = useCallback(async () => {
    if (!baseId) return;
    const { data: memberData } = await supabase
      .from("knowledge_base_members")
      .select("id, user_id, role")
      .eq("base_id", baseId);
    const userIds = (memberData || []).map(m => m.user_id);
    let profileMap = {};
    if (userIds.length > 0) {
      const { data: profileData } = await supabase
        .from("profiles").select("id, email").in("id", userIds);
      (profileData || []).forEach(p => { profileMap[p.id] = p; });
    }
    setMembers((memberData || []).map(m => ({ ...m, profiles: profileMap[m.user_id] || null })));
  }, [baseId]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const addMember = async (email, role) => {
    // RPC security definer : ne renvoie qu'un id (ou null) — la table
    // profiles n'est plus lisible en masse (migration 009).
    const { data: targetId, error: lookupErr } = await supabase
      .rpc("find_user_id_by_email", { lookup_email: email });

    if (lookupErr) return { error: lookupErr.message };
    if (!targetId) return { error: "Utilisateur introuvable" };
    if (targetId === userId) return { error: "C'est toi !" };

    const { error } = await supabase
      .from("knowledge_base_members")
      .insert({ base_id: baseId, user_id: targetId, role, invited_by: userId });

    if (error) {
      if (error.code === "23505") return { error: "Déjà membre" };
      return { error: error.message };
    }
    await fetchMembers();
    window.dispatchEvent(new CustomEvent("bases-share-changed"));
    return { success: true };
  };

  const removeMember = async (memberId) => {
    const { error } = await supabase.from("knowledge_base_members").delete().eq("id", memberId);
    if (error) { console.error("removeMember error:", error); return; }
    setMembers(m => m.filter(x => x.id !== memberId));
    window.dispatchEvent(new CustomEvent("bases-share-changed"));
  };

  const updateRole = async (memberId, role) => {
    const { error } = await supabase.from("knowledge_base_members").update({ role }).eq("id", memberId);
    if (error) { console.error("updateRole error:", error); return; }
    setMembers(m => m.map(x => x.id === memberId ? { ...x, role } : x));
    window.dispatchEvent(new CustomEvent("bases-share-changed"));
  };

  return { members, addMember, removeMember, updateRole };
}
