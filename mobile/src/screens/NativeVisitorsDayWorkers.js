import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import NativeDropdown from '../components/NativeDropdown';
import { Empty, Loading, Screen, SectionTitle } from '../components/NativeScreenKit';
import { apiRequest } from '../services/api';

const today = () => new Date().toISOString().slice(0, 10);
const currentTime = () => new Date().toTimeString().slice(0, 5);
const blankVisitor = location => ({ visitor_name: '', mobile: '', organization: '', purpose: '', person_to_meet_email: '', visit_date: today(), in_time: currentTime(), production_at: location || '', remarks: '' });
const blankWorker = location => ({ worker_name: '', purpose: '', approved_by_email: '', work_date: today(), in_time: currentTime(), production_at: location || '', remarks: '' });

export default function NativeVisitorsDayWorkers({ filters, onBack }) {
  const [tab, setTab] = useState('visitor');
  const [visitor, setVisitor] = useState(() => blankVisitor(filters.location));
  const [worker, setWorker] = useState(() => blankWorker(filters.location));
  const [visitors, setVisitors] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [lookups, setLookups] = useState({ purposes: [], locations: [], users: [] });
  const [dayCharges, setDayCharges] = useState({});
  const [canEditLockedCharge, setCanEditLockedCharge] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await apiRequest('/attendance/visitors-day-workers');
      setVisitors(payload.visitors || []); setWorkers(payload.day_workers || []); setLookups(payload.lookups || {});
      setDayCharges(Object.fromEntries((payload.day_workers || []).map(row => [row.id, String(row.day_charge ?? 0)])));
      setCanEditLockedCharge(Boolean(payload.permissions?.can_edit_locked_day_charge)); setMessage('');
    } catch (error) { setMessage(error.message || 'Unable to load visitors and day workers.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!filters.location) return;
    setVisitor(current => ({ ...current, production_at: filters.location }));
    setWorker(current => ({ ...current, production_at: filters.location }));
  }, [filters.location]);

  const userOptions = useMemo(() => (lookups.users || []).map(user => `${user.name} | ${user.email}`), [lookups.users]);
  const selectedEmail = value => String(value || '').split(' | ').pop();
  const update = (type, key, value) => type === 'visitor'
    ? setVisitor(current => ({ ...current, [key]: value }))
    : setWorker(current => ({ ...current, [key]: value }));

  const save = async type => {
    const form = type === 'visitor' ? visitor : worker;
    const approver = type === 'visitor' ? form.person_to_meet_email : form.approved_by_email;
    const name = type === 'visitor' ? form.visitor_name : form.worker_name;
    if (!name.trim() || !form.purpose.trim() || !approver) { setMessage('Name, purpose and approving user are required.'); return; }
    setSaving(true); setMessage('');
    try {
      const payload = type === 'visitor'
        ? { ...form, person_to_meet_email: selectedEmail(form.person_to_meet_email) }
        : { ...form, approved_by_email: selectedEmail(form.approved_by_email) };
      await apiRequest(`/attendance/visitors-day-workers/${type === 'visitor' ? 'visitor' : 'day-worker'}`, { method: 'POST', body: JSON.stringify(payload) });
      setSuccess(type === 'visitor' ? 'Visitor approval sent.' : 'Day worker approval sent.');
      if (type === 'visitor') setVisitor(blankVisitor(filters.location)); else setWorker(blankWorker(filters.location));
      await load();
    } catch (error) { setMessage(error.message || 'Unable to save entry.'); }
    finally { setSaving(false); }
  };

  const markOut = async (type, id) => {
    setSaving(true); setMessage('');
    try {
      await apiRequest(`/attendance/visitors-day-workers/${type}/${id}/out`, { method: 'POST' });
      setSuccess('OUT time saved.'); await load();
    } catch (error) { setMessage(error.message || 'Unable to save OUT time.'); }
    finally { setSaving(false); }
  };

  const remove = async (type, id) => {
    setSaving(true); setMessage('');
    try {
      await apiRequest(`/attendance/visitors-day-workers/${type}/delete/${id}`, { method: 'POST' });
      setSuccess('Entry deleted.'); await load();
    } catch (error) { setMessage(error.message || 'Unable to delete entry.'); }
    finally { setSaving(false); }
  };

  const saveCharge = async id => {
    setSaving(true); setMessage('');
    try {
      await apiRequest(`/attendance/visitors-day-workers/day-worker/${id}/charge`, { method:'POST', body:JSON.stringify({day_charge:dayCharges[id]}) });
      setSuccess('Day charge saved and locked.'); await load();
    } catch(error){setMessage(error.message||'Unable to save day charge.');}
    finally{setSaving(false);}
  };

  const openAudit = async () => {
    setAuditOpen(true); setAuditLoading(true);
    try { const payload=await apiRequest('/attendance/visitors-day-workers/day-worker-charge-audit'); setAudits(payload.audits||[]); }
    catch(error){setMessage(error.message||'Unable to load audit trail.');}
    finally{setAuditLoading(false);}
  };

  const activeForm = tab === 'visitor' ? visitor : worker;
  const activeRows = tab === 'visitor' ? visitors : workers;
  return <Screen title="Visitors & Day Workers" subtitle="Entry and approval register" onBack={onBack} onRefresh={load} globalFilters={filters}>
    <View style={styles.tabs}>{[['visitor','VISITORS'],['day-worker','DAY WORKERS']].map(([key,label]) => <Pressable key={key} onPress={() => setTab(key)} style={[styles.tab,tab===key&&styles.tabActive]}><Text style={[styles.tabText,tab===key&&styles.tabTextActive]}>{label}</Text></Pressable>)}</View>
    <Pressable onPress={openAudit} style={styles.auditButton}><Text style={styles.auditButtonText}>◷ AUDIT TRAIL</Text></Pressable>
    {message ? <Notice text={message} error onClose={() => setMessage('')} /> : null}{success ? <Notice text={success} onClose={() => setSuccess('')} /> : null}
    <SectionTitle>{tab === 'visitor' ? 'Visitor Entry' : 'Day Worker Entry'}</SectionTitle>
    <View style={styles.form}><View style={styles.grid}>
      <Input label={tab === 'visitor' ? 'Visitor Name *' : 'Worker Name *'} value={tab === 'visitor' ? activeForm.visitor_name : activeForm.worker_name} onChangeText={value => update(tab, tab === 'visitor' ? 'visitor_name' : 'worker_name', value)} />
      {tab === 'visitor' ? <><Input label="Mobile" value={visitor.mobile} onChangeText={value => update(tab,'mobile',value)} keyboardType="phone-pad" /><Input label="Organization" value={visitor.organization} onChangeText={value => update(tab,'organization',value)} /></> : null}
      <Input label="Purpose *" value={activeForm.purpose} onChangeText={value => update(tab,'purpose',value)} />
      <View style={styles.dropdownField}><NativeDropdown required label={tab === 'visitor' ? 'Person To Meet' : 'Approved By'} values={userOptions} value={tab === 'visitor' ? visitor.person_to_meet_email : worker.approved_by_email} onChange={value => update(tab,tab === 'visitor' ? 'person_to_meet_email' : 'approved_by_email',value)} placeholder="Select registered user" /></View>
      <Input label={tab === 'visitor' ? 'Visit Date' : 'Work Date'} value={tab === 'visitor' ? visitor.visit_date : worker.work_date} onChangeText={value => update(tab,tab === 'visitor' ? 'visit_date' : 'work_date',value)} />
      <Input label="IN Time" value={activeForm.in_time} onChangeText={value => update(tab,'in_time',value)} />
      <View style={styles.dropdownField}><NativeDropdown label="Plant / Location" values={lookups.locations || filters.locations || []} value={activeForm.production_at} onChange={value => update(tab,'production_at',value)} /></View>
      <Input label="Remarks" value={activeForm.remarks} onChangeText={value => update(tab,'remarks',value)} />
    </View><Pressable disabled={saving} onPress={() => save(tab)} style={[styles.save,saving&&styles.disabled]}><Text style={styles.saveText}>{saving?'Saving…':tab==='visitor'?'SAVE VISITOR':'SAVE DAY WORKER'}</Text></Pressable></View>
    <SectionTitle>{tab === 'visitor' ? 'Visitor Register' : 'Day Worker Register'} ({activeRows.length})</SectionTitle>
    {loading ? <Loading /> : <Register rows={activeRows} type={tab} onOut={markOut} onDelete={remove} saving={saving} dayCharges={dayCharges} setDayCharges={setDayCharges} saveCharge={saveCharge} canEditLockedCharge={canEditLockedCharge} />}
    <Modal visible={auditOpen} animationType="slide" onRequestClose={()=>setAuditOpen(false)}><View style={styles.auditPage}><View style={styles.auditHead}><View><Text style={styles.auditEyebrow}>DAY WORKER CHARGES</Text><Text style={styles.auditTitle}>Audit Trail</Text></View><Pressable onPress={()=>setAuditOpen(false)}><Text style={styles.auditClose}>×</Text></Pressable></View><ScrollView contentContainerStyle={styles.auditList}>{auditLoading?<Loading text="Loading audit trail…"/>:audits.length?audits.map(item=><View key={item.id} style={styles.auditItem}><Text style={styles.auditWorker}>{item.worker_name} · {item.work_date}</Text><Text style={styles.auditChange}>₹{Number(item.old_value||0).toFixed(2)} → ₹{Number(item.new_value||0).toFixed(2)}</Text><Text style={styles.auditMeta}>{item.edited_by} · {String(item.edited_at||'').replace('T',' ').slice(0,19)}</Text></View>):<Empty text="No charge changes found."/>}</ScrollView></View></Modal>
  </Screen>;
}

function Register({ rows, type, onOut, onDelete, saving, dayCharges, setDayCharges, saveCharge, canEditLockedCharge }) {
  const visitor = type === 'visitor';
  const headers = visitor ? ['Date','Name','Person To Meet','IN','OUT','Approval','Action'] : ['Date','Name','Approved By','IN','OUT','Day Charge','Approval','Action'];
  const widths = visitor ? [80,120,145,90,80,80,135] : [80,120,145,90,80,155,80,135];
  return <ScrollView horizontal style={styles.tableShell}><View><View style={[styles.tableRow,styles.tableHead]}>{headers.map((label,index)=><Text key={label} style={[styles.th,{width:widths[index]}]}>{label}</Text>)}</View>{rows.map(row=>{const locked=Boolean(row.day_charge_locked);const readOnly=locked&&!canEditLockedCharge;return <View key={row.id} style={styles.tableRow}><Cell width={80} text={visitor?row.visit_date:row.work_date}/><Cell width={120} text={visitor?row.visitor_name:row.worker_name} bold/><Cell width={145} text={visitor?row.person_to_meet:row.approved_by_name}/><Cell width={90} text={String(row.in_time||'').slice(0,5)}/><Cell width={80} text={String(row.out_time||'').slice(0,5)}/>{!visitor?<View style={[styles.chargeCell,{width:155}]}><TextInput editable={!readOnly} keyboardType="decimal-pad" value={dayCharges[row.id]??'0'} onChangeText={value=>setDayCharges(current=>({...current,[row.id]:value}))} style={[styles.chargeInput,readOnly&&styles.chargeInputLocked]}/>{readOnly?<Text style={styles.lockedText}>LOCKED</Text>:<Pressable disabled={saving} onPress={()=>saveCharge(row.id)} style={styles.chargeSave}><Text style={styles.chargeSaveText}>{locked?'ADMIN SAVE':'SAVE & LOCK'}</Text></Pressable>}</View>:null}<Cell width={80} text={row.approval_status} tone={row.approval_status==='APPROVED'?'#15803d':row.approval_status==='REJECTED'?'#dc2626':'#b45309'}/><View style={[styles.cellAction,{width:135}]}><View style={styles.rowActions}>{!row.out_time&&row.approval_status==='APPROVED'?<Pressable disabled={saving} onPress={()=>onOut(type,row.id)} style={styles.outButton}><Text style={styles.outText}>OUT</Text></Pressable>:<Text style={styles.wait}>{row.out_time?'SAVED':row.approval_status==='REJECTED'?'REJECTED':'WAITING'}</Text>}<Pressable disabled={saving||Boolean(row.out_time)} onPress={()=>onDelete(type,row.id)} style={[styles.deleteButton,row.out_time&&styles.deleteDisabled]}><Text style={styles.deleteText}>DELETE</Text></Pressable></View></View></View>})}{!rows.length?<Empty/>:null}</View></ScrollView>;
}
function Input({label,...props}){return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput placeholderTextColor="#94a3b8" style={styles.input} {...props}/></View>;}
function Notice({text,error,onClose}){return <Pressable onPress={onClose} style={[styles.notice,error&&styles.noticeError]}><Text style={[styles.noticeText,error&&styles.noticeErrorText]}>{text}</Text><Text style={styles.close}>×</Text></Pressable>;}
function Cell({width,text,bold,tone}){return <Text numberOfLines={2} style={[styles.td,{width},bold&&styles.bold,tone&&{color:tone}]}>{text||'—'}</Text>;}

const styles=StyleSheet.create({
  tabs:{flexDirection:'row',gap:6},tab:{flex:1,height:36,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#cbd5e1',borderRadius:9,backgroundColor:'#fff'},tabActive:{borderColor:'#2563eb',backgroundColor:'#2563eb'},tabText:{color:'#64748b',fontSize:9.5,fontWeight:'900'},tabTextActive:{color:'#fff'},
  auditButton:{alignSelf:'flex-end',marginTop:8,paddingHorizontal:11,paddingVertical:8,borderWidth:1,borderColor:'#93c5fd',borderRadius:8,backgroundColor:'#eff6ff'},auditButtonText:{color:'#1d4ed8',fontSize:9.5,fontWeight:'900'},
  form:{gap:8,padding:9,borderWidth:1,borderColor:'#dbe3ef',borderRadius:12,backgroundColor:'#fff'},grid:{flexDirection:'row',flexWrap:'wrap',gap:8},field:{width:'48.5%',minWidth:0},dropdownField:{width:'48.5%',minWidth:0},label:{marginBottom:4,color:'#64748b',fontSize:9,fontWeight:'900',textTransform:'uppercase'},input:{height:40,paddingHorizontal:9,borderWidth:1,borderColor:'#cbd5e1',borderRadius:9,color:'#0f172a',backgroundColor:'#fff',fontSize:11.5,fontWeight:'700'},save:{height:44,alignItems:'center',justifyContent:'center',borderRadius:9,backgroundColor:'#2563eb'},saveText:{color:'#fff',fontSize:11,fontWeight:'900'},disabled:{opacity:.5},
  notice:{flexDirection:'row',alignItems:'center',marginTop:8,padding:9,borderWidth:1,borderColor:'#86efac',borderRadius:8,backgroundColor:'#f0fdf4'},noticeError:{borderColor:'#fecaca',backgroundColor:'#fef2f2'},noticeText:{flex:1,color:'#15803d',fontSize:11,fontWeight:'800'},noticeErrorText:{color:'#dc2626'},close:{color:'#64748b',fontSize:18},
  tableShell:{borderWidth:1,borderColor:'#dbe3ef',borderRadius:9,backgroundColor:'#fff'},tableRow:{minHeight:43,flexDirection:'row',borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:'#dbe3ef'},tableHead:{minHeight:29,backgroundColor:'#eaf1fb'},th:{padding:5,color:'#1e3a5f',fontSize:8,fontWeight:'900',textTransform:'uppercase'},td:{padding:5,color:'#334155',fontSize:9.5,fontWeight:'650'},bold:{color:'#0f172a',fontWeight:'900'},cellAction:{alignItems:'center',justifyContent:'center'},rowActions:{flexDirection:'row',alignItems:'center',gap:5},outButton:{paddingHorizontal:11,paddingVertical:6,borderRadius:6,backgroundColor:'#15803d'},outText:{color:'#fff',fontSize:9,fontWeight:'900'},wait:{color:'#64748b',fontSize:8,fontWeight:'900'},deleteButton:{paddingHorizontal:7,paddingVertical:6,borderRadius:6,backgroundColor:'#fee2e2'},deleteDisabled:{opacity:.35},deleteText:{color:'#dc2626',fontSize:8,fontWeight:'900'},chargeCell:{flexDirection:'row',alignItems:'center',gap:4,padding:4},chargeInput:{width:58,height:30,paddingHorizontal:5,borderWidth:1,borderColor:'#cbd5e1',borderRadius:5,color:'#0f172a',fontSize:9},chargeInputLocked:{backgroundColor:'#e2e8f0',opacity:.7},chargeSave:{flex:1,paddingVertical:6,borderRadius:5,backgroundColor:'#2563eb'},chargeSaveText:{color:'#fff',fontSize:7,fontWeight:'900',textAlign:'center'},lockedText:{color:'#64748b',fontSize:8,fontWeight:'900'},
  auditPage:{flex:1,backgroundColor:'#f4f7fb'},auditHead:{minHeight:90,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingTop:26,backgroundColor:'#0b2345'},auditEyebrow:{color:'#67e8f9',fontSize:9,fontWeight:'900'},auditTitle:{marginTop:3,color:'#fff',fontSize:20,fontWeight:'900'},auditClose:{color:'#fff',fontSize:28},auditList:{padding:10},auditItem:{marginBottom:8,padding:11,borderWidth:1,borderColor:'#dbe3ef',borderRadius:10,backgroundColor:'#fff'},auditWorker:{color:'#0f172a',fontSize:11,fontWeight:'900'},auditChange:{marginTop:5,color:'#2563eb',fontSize:14,fontWeight:'900'},auditMeta:{marginTop:5,color:'#64748b',fontSize:9},
});
