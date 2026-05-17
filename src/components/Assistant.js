import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import * as C from '../theme/colors';

const AGENT_URL = 'https://mbirzaocjkhqydtuqmze.supabase.co/functions/v1/agent';

const SUGGESTIONS = [
  '¿Cuántos bookings tengo hoy?',
  'Bookings pendientes esta semana',
  '¿Quién entrega mañana?',
];

export default function Assistant() {
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const inflightRef = useRef(null);

  // If a request was in-flight when the page got suspended (mobile tab switch,
  // PWA backgrounded), the promise never resolves on resume and `sending`
  // stays true forever — input disabled, UI stuck. Reset on every open.
  useEffect(() => {
    if (open && sending) {
      try {
        inflightRef.current?.abort();
      } catch {}
      setSending(false);
    }
  }, [open]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        if (active) setAllowed(false);
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();
      if (active) setAllowed((profile?.role || '') !== 'driver');
    })();
    return () => {
      active = false;
    };
  }, []);

  async function sendMessage(text) {
    const trimmed = (text ?? input).trim();
    if (!trimmed || sending) return;
    setInput('');
    const next = [...messages, { role: 'user', content: trimmed }];
    setMessages(next);
    setSending(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setMessages([
          ...next,
          { role: 'assistant', content: 'Tu sesión expiró. Inicia sesión otra vez.' },
        ]);
        return;
      }
      const ctrl = new AbortController();
      inflightRef.current = ctrl;
      const timeout = setTimeout(() => ctrl.abort(), 90_000);
      const res = await fetch(AGENT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ messages: next }),
        signal: ctrl.signal,
      }).finally(() => {
        clearTimeout(timeout);
        if (inflightRef.current === ctrl) inflightRef.current = null;
      });
      const json = await res.json();
      if (!res.ok) {
        setMessages([
          ...next,
          { role: 'assistant', content: `Error: ${json.error || res.status}` },
        ]);
      } else {
        setMessages([
          ...next,
          { role: 'assistant', content: json.reply || '(respuesta vacía)' },
        ]);
      }
    } catch (err) {
      const msg = err?.name === 'AbortError'
        ? 'La solicitud se canceló (timeout o pestaña suspendida). Intenta de nuevo.'
        : `Error de red: ${err.message || err}`;
      setMessages([...next, { role: 'assistant', content: msg }]);
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  if (!allowed) return null;

  return (
    <>
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="chatbubbles" size={24} color="#fff" />
      </TouchableOpacity>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.sheet}
          >
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.avatar}>
                  <Ionicons name="sparkles" size={18} color="#fff" />
                </View>
                <View>
                  <Text style={styles.headerTitle}>Asistente</Text>
                  <Text style={styles.headerSubtitle}>
                    Pregúntame sobre tus bookings
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Ionicons name="close" size={28} color={C.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={scrollRef}
              style={styles.messages}
              contentContainerStyle={{ padding: 16, gap: 12 }}
            >
              {messages.length === 0 && (
                <View style={styles.welcome}>
                  <Text style={styles.welcomeTitle}>¿En qué te ayudo?</Text>
                  <Text style={styles.welcomeBody}>
                    Puedo consultar tus bookings, ventas y operación.
                  </Text>
                  <View style={{ marginTop: 12, gap: 8 }}>
                    {SUGGESTIONS.map((s) => (
                      <TouchableOpacity
                        key={s}
                        style={styles.suggestion}
                        onPress={() => sendMessage(s)}
                      >
                        <Text style={styles.suggestionText}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {messages.map((m, i) => (
                <View
                  key={i}
                  style={[
                    styles.bubble,
                    m.role === 'user' ? styles.userBubble : styles.assistantBubble,
                  ]}
                >
                  {renderRichText(
                    m.content,
                    m.role === 'user' ? { color: '#fff' } : undefined
                  )}
                </View>
              ))}

              {sending && (
                <View style={[styles.bubble, styles.assistantBubble]}>
                  <ActivityIndicator size="small" color={C.primaryDark} />
                </View>
              )}
            </ScrollView>

            <View style={styles.inputRow}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Escribe tu pregunta..."
                placeholderTextColor={C.textMuted}
                style={styles.input}
                multiline
                editable={!sending}
                onSubmitEditing={() => sendMessage()}
              />
              <TouchableOpacity
                onPress={() => sendMessage()}
                disabled={sending || !input.trim()}
                style={[
                  styles.sendBtn,
                  (sending || !input.trim()) && { opacity: 0.4 },
                ]}
              >
                <Ionicons name="send" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

// Tiny markdown-ish renderer: handles **bold** and `- ` bullets. Anything fancier
// passes through verbatim — keeps the chat output readable without dragging in a
// full markdown parser.
function renderRichText(content, extraTextStyle) {
  const lines = String(content || '').split(/\r?\n/);
  return lines.map((rawLine, lineIdx) => {
    const isBullet = /^\s*[-*]\s+/.test(rawLine);
    const lineText = isBullet ? rawLine.replace(/^\s*[-*]\s+/, '') : rawLine;
    const segments = [];
    const regex = /\*\*([^*]+)\*\*/g;
    let lastIdx = 0;
    let match;
    let key = 0;
    while ((match = regex.exec(lineText)) !== null) {
      if (match.index > lastIdx) {
        segments.push(
          <Text key={key++} style={[styles.bubbleText, extraTextStyle]}>
            {lineText.slice(lastIdx, match.index)}
          </Text>
        );
      }
      segments.push(
        <Text
          key={key++}
          style={[styles.bubbleText, extraTextStyle, { fontWeight: '700' }]}
        >
          {match[1]}
        </Text>
      );
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx < lineText.length) {
      segments.push(
        <Text key={key++} style={[styles.bubbleText, extraTextStyle]}>
          {lineText.slice(lastIdx)}
        </Text>
      );
    }
    if (segments.length === 0) {
      segments.push(
        <Text key={0} style={[styles.bubbleText, extraTextStyle]}>
          {lineText}
        </Text>
      );
    }

    if (isBullet) {
      return (
        <View
          key={lineIdx}
          style={{ flexDirection: 'row', gap: 8, marginBottom: 2 }}
        >
          <Text style={[styles.bubbleText, extraTextStyle]}>•</Text>
          <Text style={[styles.bubbleText, extraTextStyle, { flex: 1 }]}>
            {segments}
          </Text>
        </View>
      );
    }
    if (rawLine.trim() === '') {
      return <View key={lineIdx} style={{ height: 6 }} />;
    }
    return (
      <Text key={lineIdx} style={[styles.bubbleText, extraTextStyle]}>
        {segments}
      </Text>
    );
  });
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    // Bottom-LEFT so it doesn't collide with the per-screen primary FAB on
    // the right (e.g. "+" new booking on the Bookings tab). Tab bar sits at
    // ~72px so we offset 88px to clear it.
    bottom: 88,
    left: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.primary,         // CAT yellow per the new brand
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 1000,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '80%',
    backgroundColor: C.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  headerSubtitle: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  messages: { flex: 1 },
  welcome: { paddingVertical: 24 },
  welcomeTitle: { fontSize: 20, fontWeight: '700', color: C.text },
  welcomeBody: { fontSize: 14, color: C.textSecondary, marginTop: 4 },
  suggestion: {
    backgroundColor: C.bgCard,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  suggestionText: { fontSize: 14, color: C.text },
  bubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: 14,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: C.primaryDark,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: C.bgCard,
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 15, color: C.text, lineHeight: 21 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.bg,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: C.bgCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    fontSize: 15,
    color: C.text,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
