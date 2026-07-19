import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { apiRequest } from '../services/api';
import { API_URL } from '../config';
import { Empty, ErrorState, Loading, Screen, SectionTitle } from '../components/NativeScreenKit';

export default function NativeComplaints({ onBack, filters = {} }) {
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [search, setSearch] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const payload = await apiRequest('/support/my_tickets?format=json');
      setTickets(payload.tickets || []);
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const openTicket = async ticket => {
    setSelected(ticket); setMessages([]); setError('');
    try {
      const payload = await apiRequest(`/support/get_messages/${ticket.id}`);
      setMessages(payload.messages || []);
      setSelected(current => ({ ...current, status: payload.status, subject: payload.subject || current.subject }));
    } catch (requestError) { setError(requestError.message); }
  };

  const createTicket = () => {
    if (!subject.trim() || !message.trim()) { setError('Subject and message are required.'); return; }
    setSubmitting(true); setError('');
    const form = new FormData(); form.append('subject', subject.trim()); form.append('message', message.trim());
    apiRequest('/support/create_ticket', { method: 'POST', body: form })
      .then(() => { setCreateOpen(false); setSubject(''); setMessage(''); return load(); })
      .catch(requestError => setError(requestError.message))
      .finally(() => setSubmitting(false));
  };

  const sendReply = () => {
    if ((!reply.trim() && !attachment) || !selected) return;
    setSubmitting(true); setError('');
    const form = new FormData(); form.append('ticket_id', String(selected.id)); form.append('message', reply.trim());
    if (attachment) form.append('file', { uri: attachment.uri, name: attachment.name, type: attachment.mimeType || 'application/octet-stream' });
    apiRequest('/support/send_message', { method: 'POST', body: form })
      .then(() => { setReply(''); setAttachment(null); return openTicket(selected); })
      .catch(requestError => setError(requestError.message))
      .finally(() => setSubmitting(false));
  };
  const pickAttachment = async () => { const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false }); if (!result.canceled && result.assets?.[0]) setAttachment(result.assets[0]); };
  const filteredTickets = tickets.filter(ticket => !search || `${ticket.ticket_number} ${ticket.subject}`.toLowerCase().includes(search.toLowerCase()));

  return <Screen title="My Complaints" subtitle={`${tickets.length} support tickets`} globalFilters={filters} onBack={onBack} onRefresh={load}>
    {loading ? <Loading text="Loading complaints…" /> : error && !tickets.length ? <ErrorState message={error} onRetry={load} /> : <>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={() => { setCreateOpen(true); setError(''); }} style={styles.newButton}><Text style={styles.newButtonText}>＋ New Complaint</Text></Pressable>
      <TextInput style={styles.search} value={search} onChangeText={setSearch} placeholder="Search complaints…" placeholderTextColor="#718299" />
      <SectionTitle>Support Tickets</SectionTitle>
      {filteredTickets.length ? filteredTickets.map(ticket => <Pressable key={ticket.id} onPress={() => openTicket(ticket)} style={styles.ticket}><View style={styles.ticketCopy}><Text style={styles.ticketNumber}>{ticket.ticket_number}</Text><Text style={styles.ticketSubject}>{ticket.subject}</Text><Text style={styles.ticketDate}>{ticket.date}</Text></View><Text style={[styles.status, ticket.status === 'RESOLVED' && styles.resolved]}>{ticket.status}</Text></Pressable>) : <Empty text="No complaints found." />}
    </>}

    <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}><View style={styles.modalOverlay}><View style={styles.modalCard}><View style={styles.modalHeader}><Text style={styles.modalTitle}>New Complaint</Text><Pressable onPress={() => setCreateOpen(false)}><Text style={styles.close}>×</Text></Pressable></View><TextInput style={styles.input} value={subject} onChangeText={setSubject} placeholder="Subject" placeholderTextColor="#718299" /><TextInput style={[styles.input, styles.messageInput]} value={message} onChangeText={setMessage} placeholder="Describe the issue" placeholderTextColor="#718299" multiline textAlignVertical="top" /><Pressable disabled={submitting} onPress={createTicket} style={styles.submit}><Text style={styles.submitText}>{submitting ? 'Submitting…' : 'Submit Complaint'}</Text></Pressable></View></View></Modal>

    <Modal visible={Boolean(selected)} animationType="slide" onRequestClose={() => setSelected(null)}><View style={styles.chatPage}><View style={styles.chatHeader}><Pressable onPress={() => setSelected(null)} style={styles.chatBack}><Text style={styles.chatBackText}>‹</Text></Pressable><View style={styles.chatCopy}><Text style={styles.chatTitle}>{selected?.subject}</Text><Text style={styles.chatSub}>{selected?.ticket_number} • {selected?.status}</Text></View></View><ScrollView contentContainerStyle={styles.messages}>{messages.map((item, index) => <View key={`${item.time}-${index}`} style={[styles.bubble, item.sender_type === 'USER' ? styles.userBubble : styles.supportBubble]}><Text style={[styles.sender, item.sender_type === 'USER' && styles.userMessage]}>{item.sender_type === 'USER' ? 'You' : 'Support'}</Text><Text style={[styles.message, item.sender_type === 'USER' && styles.userMessage]}>{item.message}</Text>{item.media_path ? <Text onPress={() => Linking.openURL(`${API_URL}${item.media_path}`)} style={[styles.media, item.sender_type === 'USER' && styles.userMessage]}>Open attachment</Text> : null}<Text style={[styles.time, item.sender_type === 'USER' && styles.userMessage]}>{item.time}</Text></View>)}{!messages.length ? <Empty text="No messages found." /> : null}</ScrollView>{attachment ? <View style={styles.fileBar}><Text numberOfLines={1} style={styles.fileName}>{attachment.name}</Text><Pressable onPress={() => setAttachment(null)}><Text style={styles.fileRemove}>×</Text></Pressable></View> : null}<View style={styles.replyBar}><Pressable onPress={pickAttachment} style={styles.attach}><Text style={styles.attachText}>＋</Text></Pressable><TextInput style={styles.replyInput} value={reply} onChangeText={setReply} placeholder="Type a reply…" placeholderTextColor="#718299" multiline /><Pressable disabled={submitting || (!reply.trim() && !attachment)} onPress={sendReply} style={styles.send}><Text style={styles.sendText}>Send</Text></Pressable></View></View></Modal>
  </Screen>;
}

const styles = StyleSheet.create({ error: { marginBottom: 10, padding: 10, borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, color: '#dc2626', backgroundColor: '#fef2f2', fontSize: 13, fontWeight: '800' }, newButton: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#2563eb' }, newButtonText: { color: '#fff', fontSize: 12, fontWeight: '900' }, search: { height: 44, marginTop: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 11, color: '#0f172a', backgroundColor: '#fff', fontSize: 11 }, ticket: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#dbe3ef', backgroundColor: '#fff' }, ticketCopy: { flex: 1, minWidth: 0 }, ticketNumber: { color: '#2563eb', fontSize: 12, fontWeight: '900' }, ticketSubject: { marginTop: 4, color: '#0f172a', fontSize: 12, fontWeight: '850' }, ticketDate: { marginTop: 4, color: '#64748b', fontSize: 11, fontWeight: '700' }, status: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, color: '#a16207', backgroundColor: '#fef9c3', fontSize: 11, fontWeight: '900' }, resolved: { color: '#15803d', backgroundColor: '#dcfce7' }, modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#02061788' }, modalCard: { padding: 18, paddingBottom: 28, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#fff' }, modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }, modalTitle: { color: '#0f172a', fontSize: 17, fontWeight: '900' }, close: { color: '#64748b', fontSize: 27 }, input: { minHeight: 50, marginBottom: 11, paddingHorizontal: 13, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, color: '#0f172a', backgroundColor: '#fff', fontSize: 12, fontWeight: '700' }, messageInput: { height: 115, paddingTop: 13 }, submit: { height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#2563eb' }, submitText: { color: '#fff', fontSize: 12, fontWeight: '900' }, chatPage: { flex: 1, backgroundColor: '#f4f7fb' }, chatHeader: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#dbe3ef', backgroundColor: '#fff' }, chatBack: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#eff6ff' }, chatBackText: { color: '#2563eb', fontSize: 27 }, chatCopy: { flex: 1 }, chatTitle: { color: '#0f172a', fontSize: 13, fontWeight: '900' }, chatSub: { marginTop: 3, color: '#64748b', fontSize: 12, fontWeight: '700' }, messages: { flexGrow: 1, padding: 14, gap: 9 }, bubble: { maxWidth: '84%', padding: 11, borderRadius: 14 }, userBubble: { alignSelf: 'flex-end', backgroundColor: '#2563eb' }, supportBubble: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#dbe3ef', backgroundColor: '#fff' }, sender: { marginBottom: 4, color: '#2563eb', fontSize: 11, fontWeight: '900' }, message: { color: '#0f172a', fontSize: 11, lineHeight: 17, fontWeight: '650' }, userMessage: { color: '#fff' }, media: { marginTop: 6, color: '#2563eb', fontSize: 12, fontWeight: '900', textDecorationLine: 'underline' }, time: { marginTop: 5, color: '#94a3b8', fontSize: 13, textAlign: 'right' }, fileBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: '#dbeafe' }, fileName: { flex: 1, color: '#1e3a5f', fontSize: 12, fontWeight: '750' }, fileRemove: { color: '#dc2626', fontSize: 21 }, replyBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: '#dbe3ef', backgroundColor: '#fff' }, attach: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 11 }, attachText: { color: '#2563eb', fontSize: 21 }, replyInput: { flex: 1, maxHeight: 90, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, color: '#0f172a', backgroundColor: '#fff', fontSize: 11 }, send: { height: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 11, backgroundColor: '#2563eb' }, sendText: { color: '#fff', fontSize: 13, fontWeight: '900' } });
