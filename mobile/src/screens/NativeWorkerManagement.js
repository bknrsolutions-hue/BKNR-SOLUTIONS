import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import NativeDropdown from '../components/NativeDropdown';
import { Empty, Loading, Screen, SectionTitle } from '../components/NativeScreenKit';
import { apiRequest } from '../services/api';

const today = () => new Date().toISOString().slice(0, 10);
const blankMember = kind => kind === 'contract'
  ? { labour_name: '', contractor_name: '', department: 'Peeling', mobile: '', aadhar_number: '', joining_date: today(), production_at: '', remarks: '' }
  : { worker_name: '', department: 'Peeling', mobile: '', aadhar_number: '', joining_date: today(), production_at: '', remarks: '' };

export default function NativeWorkerManagement({ kind, filters, onBack }) {
  const contract = kind === 'contract';
  const title = contract ? 'Contract Workers' : 'KG Company Staff';
  const dataUrl = contract ? '/attendance/labour-management' : '/attendance/kg-basis-labour';
  const saveUrl = contract ? '/attendance/labour-management/contract/bulk' : '/attendance/kg-basis-labour/registration/bulk';
  const punchUrl = contract ? '/attendance/labour-management/contract/punch' : '/attendance/kg-basis-labour/punch';
  const [tab, setTab] = useState('registration');
  const [member, setMember] = useState(() => blankMember(kind));
  const [queue, setQueue] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [lookups, setLookups] = useState({ contractors: [], locations: [] });
  const [ids, setIds] = useState('');
  const [action, setAction] = useState('IN');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await apiRequest(dataUrl);
      setWorkers(contract ? payload.contract_labour || [] : payload.workers || []);
      setAttendance(contract ? payload.contract_attendance || [] : payload.attendance || []);
      setLookups(payload.lookups || { contractors: [], locations: [] });
      setMessage('');
    } catch (error) {
      setMessage(error.message || `Unable to load ${title}.`);
    } finally {
      setLoading(false);
    }
  }, [contract, dataUrl, title]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (filters.location) setMember(current => ({ ...current, production_at: filters.location }));
  }, [filters.location]);

  const workerName = contract ? member.labour_name : member.worker_name;
  const update = (key, value) => setMember(current => ({ ...current, [key]: value }));
  const addMember = () => {
    if (!workerName.trim() || (contract && !member.contractor_name)) {
      setMessage(contract ? 'Worker name and contractor are required.' : 'Worker name is required.');
      return;
    }
    setQueue(current => [...current, member]);
    setMember({ ...blankMember(kind), production_at: filters.location || member.production_at });
    setMessage('');
  };

  const saveMembers = async () => {
    const members = queue.length ? queue : [member];
    const invalid = members.some(item => !(contract ? item.labour_name : item.worker_name)?.trim() || (contract && !item.contractor_name));
    if (invalid) { setMessage(contract ? 'Complete worker name and contractor.' : 'Complete worker name.'); return; }
    setSaving(true); setMessage('');
    try {
      const payload = await apiRequest(saveUrl, { method: 'POST', body: JSON.stringify({ members }) });
      setSuccess(`${payload.records?.length || members.length} worker(s) registered.`);
      setQueue([]); setMember({ ...blankMember(kind), production_at: filters.location || '' });
      await load();
    } catch (error) { setMessage(error.message || 'Unable to register workers.'); }
    finally { setSaving(false); }
  };

  const punch = async () => {
    const workerIds = ids.split(/[\s,]+/).map(value => value.trim()).filter(Boolean);
    if (!workerIds.length) { setMessage('Enter one or more worker IDs.'); return; }
    setSaving(true); setMessage('');
    try {
      const body = contract ? { labour_ids: workerIds, action, location: filters.location || '' } : { worker_ids: workerIds, action, location: filters.location || '' };
      const payload = await apiRequest(punchUrl, { method: 'POST', body: JSON.stringify(body) });
      setSuccess(payload.message || `${action} punch saved.`); setIds(''); await load();
    } catch (error) { setMessage(error.message || 'Unable to save punch.'); }
    finally { setSaving(false); }
  };

  const rows = useMemo(() => workers.map(row => ({
    id: contract ? row.labour_id : row.worker_id,
    name: contract ? row.labour_name : row.worker_name,
    group: contract ? row.contractor_name : row.department,
    location: row.production_at,
    status: row.status,
  })), [contract, workers]);

  return <Screen title={title} subtitle="Registration & punching" onBack={onBack} onRefresh={load} globalFilters={filters}>
    <Tabs value={tab} onChange={setTab} />
    {message ? <Notice text={message} error onClose={() => setMessage('')} /> : null}
    {success ? <Notice text={success} onClose={() => setSuccess('')} /> : null}
    {tab === 'registration' ? <>
      <SectionTitle>Worker Registration</SectionTitle>
      <View style={styles.form}>
        <View style={styles.grid}>
          <Input label="Worker Name *" value={workerName} onChangeText={value => update(contract ? 'labour_name' : 'worker_name', value)} />
          {contract ? <NativeDropdown required label="Contractor" values={lookups.contractors || []} value={member.contractor_name} onChange={value => update('contractor_name', value)} placeholder="Select contractor" /> : null}
          <Input label="Department" value={member.department} onChangeText={value => update('department', value)} />
          <Input label="Mobile" value={member.mobile} onChangeText={value => update('mobile', value)} keyboardType="phone-pad" />
          <Input label="Aadhar Number" value={member.aadhar_number} onChangeText={value => update('aadhar_number', value)} keyboardType="number-pad" />
          <Input label="Joining Date" value={member.joining_date} onChangeText={value => update('joining_date', value)} placeholder="YYYY-MM-DD" />
          <NativeDropdown label="Plant / Location" values={lookups.locations || filters.locations || []} value={member.production_at} onChange={value => update('production_at', value)} />
          <Input label="Remarks" value={member.remarks} onChangeText={value => update('remarks', value)} />
        </View>
        <Pressable onPress={addMember} style={styles.add}><Text style={styles.addText}>+ ADD TO LIST</Text></Pressable>
        {queue.map((item, index) => <View key={`${index}-${contract ? item.labour_name : item.worker_name}`} style={styles.queueRow}><Text style={styles.queueText}>{index + 1}. {contract ? item.labour_name : item.worker_name}</Text><Pressable onPress={() => setQueue(current => current.filter((_, rowIndex) => rowIndex !== index))}><Text style={styles.remove}>REMOVE</Text></Pressable></View>)}
        <Pressable disabled={saving} onPress={saveMembers} style={[styles.save, saving && styles.disabled]}><Text style={styles.saveText}>{saving ? 'Saving…' : `REGISTER ${queue.length || 1} WORKER(S)`}</Text></Pressable>
      </View>
      <SectionTitle>Registered Workers ({rows.length})</SectionTitle>
      {loading ? <Loading /> : <WorkerTable rows={rows} />}
    </> : <>
      <SectionTitle>Multiple Punching</SectionTitle>
      <View style={styles.form}>
        <View style={styles.actions}>{['IN', 'OUT'].map(value => <Pressable key={value} onPress={() => setAction(value)} style={[styles.action, action === value && (value === 'IN' ? styles.in : styles.out)]}><Text style={[styles.actionText, action === value && styles.actionTextActive]}>{value}</Text></Pressable>)}</View>
        <Input label="Worker IDs / Numbers" value={ids} onChangeText={setIds} placeholder="1, 2, 999 or full IDs" multiline />
        <Pressable disabled={saving} onPress={punch} style={[styles.save, action === 'OUT' && styles.saveOut, saving && styles.disabled]}><Text style={styles.saveText}>{saving ? 'Saving…' : `SAVE ${action} PUNCH`}</Text></Pressable>
      </View>
      <SectionTitle>Today's Attendance ({attendance.length})</SectionTitle>
      {loading ? <Loading /> : <AttendanceTable rows={attendance} contract={contract} />}
    </>}
  </Screen>;
}

function Tabs({ value, onChange }) { return <View style={styles.tabs}>{[['registration','REGISTRATION'],['punching','PUNCHING']].map(([key,label]) => <Pressable key={key} onPress={() => onChange(key)} style={[styles.tab, value === key && styles.tabActive]}><Text style={[styles.tabText, value === key && styles.tabTextActive]}>{label}</Text></Pressable>)}</View>; }
function Input({ label, ...props }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput placeholderTextColor="#94a3b8" style={[styles.input, props.multiline && styles.multiline]} {...props} /></View>; }
function Notice({ text, error, onClose }) { return <Pressable onPress={onClose} style={[styles.notice, error && styles.noticeError]}><Text style={[styles.noticeText, error && styles.noticeErrorText]}>{text}</Text><Text style={styles.close}>×</Text></Pressable>; }
function WorkerTable({ rows }) { return <ScrollView horizontal style={styles.tableShell}><View><TableHead labels={['ID','Name','Contractor / Dept','Location','Status']} widths={[92,130,140,120,75]} />{rows.map(row => <View key={row.id} style={styles.tableRow}><Cell text={row.id} width={92} bold /><Cell text={row.name} width={130} /><Cell text={row.group} width={140} /><Cell text={row.location} width={120} /><Cell text={row.status} width={75} /></View>)}{!rows.length ? <Empty /> : null}</View></ScrollView>; }
function AttendanceTable({ rows, contract }) { return <ScrollView horizontal style={styles.tableShell}><View><TableHead labels={['ID','Name','IN','OUT','Status']} widths={[92,140,125,125,75]} />{rows.map(row => <View key={row.id} style={styles.tableRow}><Cell text={contract ? row.labour_id : row.worker_id} width={92} bold /><Cell text={contract ? row.labour_name : row.worker_name} width={140} /><Cell text={row.in_time?.replace('T',' ').slice(0,19)} width={125} /><Cell text={row.out_time?.replace('T',' ').slice(0,19)} width={125} /><Cell text={row.status} width={75} /></View>)}{!rows.length ? <Empty text="No punches today." /> : null}</View></ScrollView>; }
function TableHead({ labels, widths }) { return <View style={[styles.tableRow, styles.tableHead]}>{labels.map((label,index) => <Text key={label} style={[styles.th,{width:widths[index]}]}>{label}</Text>)}</View>; }
function Cell({ text, width, bold }) { return <Text numberOfLines={2} style={[styles.td,{width},bold && styles.bold]}>{text || '—'}</Text>; }

const styles = StyleSheet.create({
  tabs:{flexDirection:'row',gap:6},tab:{flex:1,height:36,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#cbd5e1',borderRadius:9,backgroundColor:'#fff'},tabActive:{borderColor:'#2563eb',backgroundColor:'#2563eb'},tabText:{color:'#64748b',fontSize:9.5,fontWeight:'900'},tabTextActive:{color:'#fff'},
  form:{gap:8,padding:9,borderWidth:1,borderColor:'#dbe3ef',borderRadius:12,backgroundColor:'#fff'},grid:{flexDirection:'row',flexWrap:'wrap',gap:8},field:{width:'48.5%',minWidth:0},label:{marginBottom:4,color:'#64748b',fontSize:9,fontWeight:'900',textTransform:'uppercase'},input:{height:40,paddingHorizontal:9,borderWidth:1,borderColor:'#cbd5e1',borderRadius:9,color:'#0f172a',backgroundColor:'#fff',fontSize:11.5,fontWeight:'700'},multiline:{width:'204%',height:58,paddingTop:9,textAlignVertical:'top'},
  add:{height:39,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#93c5fd',borderRadius:9,backgroundColor:'#eff6ff'},addText:{color:'#1d4ed8',fontSize:10,fontWeight:'900'},queueRow:{minHeight:34,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:9,borderRadius:7,backgroundColor:'#f8fafc'},queueText:{color:'#334155',fontSize:11,fontWeight:'800'},remove:{color:'#dc2626',fontSize:9,fontWeight:'900'},save:{height:44,alignItems:'center',justifyContent:'center',borderRadius:9,backgroundColor:'#2563eb'},saveOut:{backgroundColor:'#c2410c'},saveText:{color:'#fff',fontSize:11,fontWeight:'900'},disabled:{opacity:.5},
  actions:{flexDirection:'row',gap:7},action:{flex:1,height:40,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#cbd5e1',borderRadius:9},in:{borderColor:'#16a34a',backgroundColor:'#dcfce7'},out:{borderColor:'#dc2626',backgroundColor:'#fee2e2'},actionText:{color:'#64748b',fontWeight:'900'},actionTextActive:{color:'#0f172a'},
  notice:{flexDirection:'row',alignItems:'center',marginTop:8,padding:9,borderWidth:1,borderColor:'#86efac',borderRadius:8,backgroundColor:'#f0fdf4'},noticeError:{borderColor:'#fecaca',backgroundColor:'#fef2f2'},noticeText:{flex:1,color:'#15803d',fontSize:11,fontWeight:'800'},noticeErrorText:{color:'#dc2626'},close:{color:'#64748b',fontSize:18},
  tableShell:{borderWidth:1,borderColor:'#dbe3ef',borderRadius:9,backgroundColor:'#fff'},tableRow:{minHeight:40,flexDirection:'row',borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:'#dbe3ef'},tableHead:{minHeight:29,backgroundColor:'#eaf1fb'},th:{padding:5,color:'#1e3a5f',fontSize:8,fontWeight:'900',textTransform:'uppercase'},td:{padding:5,color:'#334155',fontSize:9.5,fontWeight:'650'},bold:{color:'#0f172a',fontWeight:'900'},
});
