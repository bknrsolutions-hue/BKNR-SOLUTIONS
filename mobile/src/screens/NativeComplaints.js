import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { apiRequest } from '../services/api';
import { API_URL } from '../config';
import { Empty, ErrorState, Loading, Screen, SectionTitle } from '../components/NativeScreenKit';
import { useERPTheme } from '../theme/ERPThemeContext';

export default function NativeComplaints({ onBack, filters = {}, panelMode = false }) {
  const { theme } = useERPTheme();
  const [tickets, setTickets] = useState([]);
  const [supportView, setSupportView] = useState('knowledge');
  const [knowledge, setKnowledge] = useState({ entries: [], categories: [], total: 0 });
  const [expandedAnswer, setExpandedAnswer] = useState('');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
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
      const [ticketPayload, knowledgePayload] = await Promise.all([
        apiRequest('/support/my_tickets?format=json'),
        apiRequest('/support/knowledge-base'),
      ]);
      setTickets(ticketPayload.tickets || []);
      setKnowledge(knowledgePayload || { entries: [], categories: [], total: 0 });
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
    apiRequest('/support/create_ticket?format=json', { method: 'POST', body: form })
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
  const normalizeQuestion = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const cleanSearch = normalizeQuestion(search);
  const questionMatchScore = question => {
    if (!cleanSearch) return 0;
    const normalized = normalizeQuestion(question);
    const queryWords = cleanSearch.split(' ').filter(Boolean);
    if (!queryWords.every(word => normalized.includes(word))) return -1;
    const questionWords = normalized.split(' ');
    return (normalized.startsWith(cleanSearch) ? 1000 : 0)
      + (normalized.includes(cleanSearch) ? 500 : 0)
      + queryWords.reduce((score, word) => score + (questionWords.some(questionWord => questionWord.startsWith(word)) ? 50 : 10), 0)
      - normalized.length / 1000;
  };
  const filteredKnowledge = (knowledge.entries || []).filter(item =>
    cleanSearch && questionMatchScore(item.question) >= 0
  );
  const knowledgeSuggestions = cleanSearch ? (knowledge.entries || [])
    .filter(item => questionMatchScore(item.question) >= 0)
    .sort((left, right) => questionMatchScore(right.question) - questionMatchScore(left.question))
    .slice(0, 6) : [];

  const viewTabs = <View style={styles.viewTabs}>
    <Pressable onPress={() => { setSupportView('knowledge'); setSearch(''); }} style={[styles.viewTab, supportView === 'knowledge' && styles.viewTabActive]}><MaterialCommunityIcons name="book-open-page-variant" size={13} color={supportView === 'knowledge' ? '#fff' : '#64748b'} /><Text style={[styles.viewTabText, supportView === 'knowledge' && styles.viewTabTextActive]}>Help ({knowledge.total || 0})</Text></Pressable>
    <Pressable onPress={() => { setSupportView('tickets'); setSearch(''); }} style={[styles.viewTab, supportView === 'tickets' && styles.viewTabActive]}><MaterialCommunityIcons name="ticket-outline" size={13} color={supportView === 'tickets' ? '#fff' : '#64748b'} /><Text style={[styles.viewTabText, supportView === 'tickets' && styles.viewTabTextActive]}>Tickets ({tickets.length})</Text></Pressable>
  </View>;

  const ticketContent = <>
    {loading ? <Loading text="Loading complaints…" /> : error && !tickets.length ? <ErrorState message={error} onRetry={load} /> : <>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={() => { setCreateOpen(true); setError(''); }} style={styles.newButton}><Text style={styles.newButtonText}>＋ New Complaint</Text></Pressable>
      <TextInput style={styles.search} value={search} onChangeText={setSearch} placeholder="Search complaints…" placeholderTextColor="#718299" />
      <SectionTitle>Support Tickets</SectionTitle>
      {filteredTickets.length ? filteredTickets.map(ticket => <Pressable key={ticket.id} onPress={() => openTicket(ticket)} style={styles.ticket}><View style={styles.ticketCopy}><Text style={styles.ticketNumber}>{ticket.ticket_number}</Text><Text style={styles.ticketSubject}>{ticket.subject}</Text><Text style={styles.ticketDate}>{ticket.date}</Text></View><Text style={[styles.status, ticket.status === 'RESOLVED' && styles.resolved]}>{ticket.status}</Text></Pressable>) : <Empty text="No complaints found." />}
    </>}
  </>;

  const knowledgeContent = <>
    {loading ? <Loading text="Loading ERP help…" /> : <>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.knowledgeSearchWrap}><TextInput style={[styles.search, styles.knowledgeSearch]} value={search} onFocus={() => setSuggestionsOpen(true)} onBlur={() => setTimeout(() => setSuggestionsOpen(false), 180)} onChangeText={value => { setSearch(value); setSuggestionsOpen(true); }} placeholder="Type a question…" placeholderTextColor="#718299" />{suggestionsOpen && cleanSearch ? <View style={styles.suggestions}>{knowledgeSuggestions.length ? knowledgeSuggestions.map(item => <Pressable key={item.id} onPress={() => { setSearch(item.question); setExpandedAnswer(item.id); setSuggestionsOpen(false); }} style={styles.suggestion}><MaterialCommunityIcons name="help-circle-outline" size={14} color="#2563eb" /><View style={styles.suggestionCopy}><Text numberOfLines={2} style={styles.suggestionQuestion}>{item.question}</Text></View></Pressable>) : <Text style={styles.noSuggestion}>No related questions found.</Text>}</View> : null}</View>
      {cleanSearch ? (filteredKnowledge.length ? filteredKnowledge.map(item => <View key={item.id} style={[styles.knowledgeItem, expandedAnswer === item.id && styles.knowledgeItemOpen]}><Pressable onPress={() => setExpandedAnswer(current => current === item.id ? '' : item.id)} style={styles.knowledgeQuestion}><View style={styles.knowledgeCopy}><Text style={styles.knowledgeTitle}>{item.question}</Text></View><MaterialCommunityIcons name={expandedAnswer === item.id ? 'chevron-up' : 'chevron-down'} size={16} color="#64748b" /></Pressable>{expandedAnswer === item.id ? <View style={styles.knowledgeAnswer}><Text style={styles.knowledgeAnswerText}>{item.answer}</Text>{item.route ? <Text style={styles.knowledgeRoute}>{item.route}</Text> : null}</View> : null}</View>) : <Empty text="No matching answer found." />) : null}
    </>}
  </>;

  const createDialog = <Modal visible={createOpen} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setCreateOpen(false)}><View style={[styles.modalOverlay, panelMode && styles.sideModalOverlay]}><View style={[styles.modalCard, panelMode && styles.sideModalCard]}><View style={styles.modalHeader}><Text style={styles.modalTitle}>New Complaint</Text><Pressable onPress={() => setCreateOpen(false)}><Text style={styles.close}>×</Text></Pressable></View><TextInput style={styles.input} value={subject} onChangeText={setSubject} placeholder="Subject" placeholderTextColor="#718299" /><TextInput style={[styles.input, styles.messageInput]} value={message} onChangeText={setMessage} placeholder="Describe the issue" placeholderTextColor="#718299" multiline textAlignVertical="top" /><Pressable disabled={submitting} onPress={createTicket} style={styles.submit}><Text style={styles.submitText}>{submitting ? 'Submitting…' : 'Submit Complaint'}</Text></Pressable></View></View></Modal>;

  const chatDialog = <Modal visible={Boolean(selected)} transparent={panelMode} animationType="slide" statusBarTranslucent={panelMode} onRequestClose={() => setSelected(null)}><View style={panelMode ? styles.sideChatOverlay : styles.chatFullOverlay}><View style={[styles.chatPage, panelMode && styles.sideChatPage]}><View style={styles.chatHeader}><Pressable onPress={() => setSelected(null)} style={styles.chatBack}><Text style={styles.chatBackText}>‹</Text></Pressable><View style={styles.chatCopy}><Text numberOfLines={2} style={styles.chatTitle}>{selected?.subject}</Text><Text style={styles.chatSub}>{selected?.ticket_number} • {selected?.status}</Text></View></View><ScrollView contentContainerStyle={styles.messages}>{messages.map((item, index) => <View key={`${item.time}-${index}`} style={[styles.bubble, item.sender_type === 'USER' ? styles.userBubble : styles.supportBubble]}><Text style={[styles.sender, item.sender_type === 'USER' && styles.userMessage]}>{item.sender_type === 'USER' ? 'You' : 'Support'}</Text><Text style={[styles.message, item.sender_type === 'USER' && styles.userMessage]}>{item.message}</Text>{item.media_path ? <Text onPress={() => Linking.openURL(`${API_URL}${item.media_path}`)} style={[styles.media, item.sender_type === 'USER' && styles.userMessage]}>Open attachment</Text> : null}<Text style={[styles.time, item.sender_type === 'USER' && styles.userMessage]}>{item.time}</Text></View>)}{!messages.length ? <Empty text="No messages found." /> : null}</ScrollView>{attachment ? <View style={styles.fileBar}><Text numberOfLines={1} style={styles.fileName}>{attachment.name}</Text><Pressable onPress={() => setAttachment(null)}><Text style={styles.fileRemove}>×</Text></Pressable></View> : null}<View style={styles.replyBar}><Pressable onPress={pickAttachment} style={styles.attach}><Text style={styles.attachText}>＋</Text></Pressable><TextInput style={styles.replyInput} value={reply} onChangeText={setReply} placeholder="Reply…" placeholderTextColor="#718299" multiline /><Pressable disabled={submitting || (!reply.trim() && !attachment)} onPress={sendReply} style={styles.send}><MaterialCommunityIcons name="send" size={16} color="#fff" /></Pressable></View></View></View></Modal>;

  if (panelMode) {
    return <View style={[styles.panelPage, { backgroundColor: theme.surface }]}>
      <View style={[styles.panelHeader, { backgroundColor: theme.header, borderColor: theme.headerBorder }]}>
        {onBack && (
          <Pressable accessibilityLabel="Back to workspace" hitSlop={6} onPress={onBack} style={[styles.panelIcon, { backgroundColor: theme.headerAlt, marginRight: 6 }]}>
            <MaterialCommunityIcons name="arrow-left" size={18} color={theme.headerAccent} />
          </Pressable>
        )}
        <View style={styles.panelTitleCopy}><Text numberOfLines={1} style={[styles.panelTitle, { color: theme.headerText }]}>SVBK Support</Text><Text numberOfLines={1} style={[styles.panelSubtitle, { color: theme.headerMuted }]}>{knowledge.total || 0} answers · {tickets.length} tickets</Text></View>
        <Pressable accessibilityLabel="Refresh support" hitSlop={6} onPress={load} style={[styles.panelIcon, { backgroundColor: theme.headerAlt }]}><MaterialCommunityIcons name="refresh" size={16} color={theme.headerAccent} /></Pressable>
        <Pressable accessibilityLabel="Close support" hitSlop={6} onPress={onBack} style={[styles.panelIcon, { backgroundColor: theme.headerAlt }]}><MaterialCommunityIcons name="close" size={18} color={theme.headerAccent} /></Pressable>
      </View>
      {viewTabs}
      <ScrollView contentContainerStyle={styles.panelContent} showsVerticalScrollIndicator={false}>{supportView === 'knowledge' ? knowledgeContent : ticketContent}</ScrollView>
      {createDialog}
      {chatDialog}
    </View>;
  }

  return <Screen title="My Complaints" subtitle={`${tickets.length} support tickets`} globalFilters={filters} onBack={onBack} onRefresh={load}>
    {viewTabs}
    {supportView === 'knowledge' ? knowledgeContent : ticketContent}
    {createDialog}
    {chatDialog}
  </Screen>;
}
