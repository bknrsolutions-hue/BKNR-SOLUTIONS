import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import * as Speech from 'expo-speech';
import { Empty, Loading, Screen, SectionTitle } from '../components/NativeScreenKit';
import { apiRequest } from '../services/api';

export function usePendingApprovals(enabled = true) {
  const [approvals, setApprovals] = useState([]);
  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const payload = await apiRequest('/attendance/approval-alerts');
      setApprovals(payload.approvals || []);
    } catch { /* Session handling is centralized. */ }
  }, [enabled]);
  useEffect(() => {
    if (!enabled) { setApprovals([]); return undefined; }
    void load();
    const interval = setInterval(load, 8000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    return () => { clearInterval(interval); subscription.remove(); };
  }, [enabled, load]);
  return { approvals, setApprovals, load };
}

export function NativeApprovalPrompt({ enabled = true }) {
  const { approvals, setApprovals } = usePendingApprovals(enabled);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const active = approvals[0];

  useEffect(() => {
    if (!active) return undefined;
    Vibration.vibrate([0, 500, 220, 500, 800, 500], true);
    Speech.speak(`Approval required. ${active.title}`, { rate: 0.9, pitch: 1.05 });
    return () => { Vibration.cancel(); Speech.stop(); };
  }, [active?.id]);

  const decide = async decision => {
    if (!active || busy) return;
    setBusy(true);
    try {
      await apiRequest(`/attendance/approval-alerts/${active.id}/decision`, { method: 'POST', body: JSON.stringify({ decision, note }) });
      Vibration.cancel(); setNote(''); setApprovals(current => current.filter(item => item.id !== active.id));
    } catch { /* Keep request visible so the user can retry. */ }
    finally { setBusy(false); }
  };

  return <Modal visible={Boolean(active)} transparent animationType="slide" onRequestClose={() => {}}><View style={styles.overlay}><View style={styles.prompt}><View style={styles.bell}><Text style={styles.bellText}>🔔</Text></View><Text style={styles.eyebrow}>APPROVAL REQUIRED</Text><Text style={styles.promptTitle}>{active?.title}</Text><Text style={styles.promptMessage}>{active?.message}</Text><TextInput value={note} onChangeText={setNote} placeholder="Decision note (optional)" placeholderTextColor="#94a3b8" multiline style={styles.noteInput}/><View style={styles.actions}><Pressable disabled={busy} onPress={()=>decide('REJECT')} style={[styles.button,styles.reject]}><Text style={styles.buttonText}>REJECT</Text></Pressable><Pressable disabled={busy} onPress={()=>decide('APPROVE')} style={[styles.button,styles.approve]}><Text style={styles.buttonText}>{busy?'SAVING…':'APPROVE & ALLOW'}</Text></Pressable></View>{approvals.length>1?<Text style={styles.more}>{approvals.length-1} more request(s)</Text>:null}</View></View></Modal>;
}

export default function NativeApprovals({ filters, onBack }) {
  const { approvals, setApprovals, load } = usePendingApprovals(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);
  const decide = async (approval, decision) => {
    setBusy(`${approval.id}-${decision}`); setMessage('');
    try {
      await apiRequest(`/attendance/approval-alerts/${approval.id}/decision`, { method:'POST',body:JSON.stringify({decision}) });
      setApprovals(current=>current.filter(item=>item.id!==approval.id));
    } catch(error){setMessage(error.message||'Unable to save approval.');}
    finally{setBusy('');}
  };
  return <Screen title="Approvals" subtitle="Visitors & day workers" onBack={onBack} onRefresh={load} globalFilters={filters}><SectionTitle>Pending Requests ({approvals.length})</SectionTitle>{message?<Text style={styles.error}>{message}</Text>:null}{loading?<Loading/>:approvals.length?approvals.map(item=><View key={item.id} style={styles.card}><Text style={styles.type}>{item.entry_type?.replace('_',' ')}</Text><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.cardMessage}>{item.message}</Text><Text style={styles.requested}>Requested by: {item.requested_by}</Text><View style={styles.actions}><Pressable disabled={Boolean(busy)} onPress={()=>decide(item,'REJECT')} style={[styles.button,styles.reject]}><Text style={styles.buttonText}>REJECT</Text></Pressable><Pressable disabled={Boolean(busy)} onPress={()=>decide(item,'APPROVE')} style={[styles.button,styles.approve]}><Text style={styles.buttonText}>{busy===`${item.id}-APPROVE`?'SAVING…':'APPROVE'}</Text></Pressable></View></View>):<Empty text="No pending approvals."/>}</Screen>;
}

const styles=StyleSheet.create({
  overlay:{flex:1,justifyContent:'flex-end',padding:10,backgroundColor:'rgba(2,8,23,.72)'},prompt:{padding:18,borderRadius:18,backgroundColor:'#fff'},bell:{width:48,height:48,alignItems:'center',justifyContent:'center',borderRadius:24,backgroundColor:'#fff7ed'},bellText:{fontSize:23},eyebrow:{marginTop:12,color:'#2563eb',fontSize:10,fontWeight:'900',letterSpacing:1},promptTitle:{marginTop:5,color:'#0f172a',fontSize:19,fontWeight:'900'},promptMessage:{marginTop:7,color:'#475569',fontSize:13,lineHeight:19,fontWeight:'650'},noteInput:{minHeight:60,marginTop:13,padding:10,borderWidth:1,borderColor:'#cbd5e1',borderRadius:9,color:'#0f172a',textAlignVertical:'top'},actions:{flexDirection:'row',gap:8,marginTop:12},button:{flex:1,minHeight:42,alignItems:'center',justifyContent:'center',borderRadius:9},reject:{backgroundColor:'#dc2626'},approve:{backgroundColor:'#15803d'},buttonText:{color:'#fff',fontSize:10,fontWeight:'900'},more:{marginTop:9,color:'#64748b',fontSize:10,fontWeight:'800',textAlign:'center'},
  card:{marginBottom:9,padding:12,borderWidth:1,borderColor:'#dbe3ef',borderRadius:12,backgroundColor:'#fff'},type:{color:'#2563eb',fontSize:9,fontWeight:'900',letterSpacing:.7},cardTitle:{marginTop:4,color:'#0f172a',fontSize:15,fontWeight:'900'},cardMessage:{marginTop:5,color:'#475569',fontSize:11.5,lineHeight:17,fontWeight:'650'},requested:{marginTop:8,color:'#64748b',fontSize:9.5,fontWeight:'750'},error:{marginBottom:8,padding:9,color:'#dc2626',borderRadius:8,backgroundColor:'#fef2f2',fontSize:11,fontWeight:'800'},
});
