import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getCompanyId } from '../src/lib/supabase';
import * as C from '../src/theme/colors';

// Quick notes / tasks for the day-to-day. Per Asaí 2026-04-30: the chaos of
// running TP day-to-day means todos get lost in Telegram. This screen gives
// the team one persistent place to dump them and check them off.
//
// Filters: Open (default — what still needs doing), Done (recent wins,
// scrollable), All (full history).

export default function NotesScreen() {
  const router = useRouter();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('open'); // open | done | all
  const [companyId, setCompanyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const cid = await getCompanyId();
    setCompanyId(cid);
    if (!cid) { setNotes([]); setLoading(false); return; }
    const { data, error } = await supabase
      .from('notes')
      .select('id, body, done, done_at, done_by, created_by, created_at')
      .eq('company_id', cid)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('notes load error:', error);
      setNotes([]);
    } else {
      setNotes(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'open') return notes.filter((n) => !n.done);
    if (filter === 'done') return notes.filter((n) => n.done);
    return notes;
  }, [notes, filter]);

  const counts = useMemo(() => ({
    open: notes.filter((n) => !n.done).length,
    done: notes.filter((n) => n.done).length,
    all: notes.length,
  }), [notes]);

  const addNote = async () => {
    const text = draft.trim();
    if (!text || saving) return;
    if (!companyId) { Alert.alert('No session', 'Sign in again.'); return; }
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase
      .from('notes')
      .insert({
        company_id: companyId,
        body: text,
        created_by: session?.user?.id || null,
      })
      .select()
      .single();
    setSaving(false);
    if (error) {
      console.error('note insert error:', error);
      Alert.alert('Error', "Couldn't save the note.");
      return;
    }
    setDraft('');
    setNotes((prev) => [data, ...prev]);
  };

  const toggleDone = async (note) => {
    const newDone = !note.done;
    const { data: { session } } = await supabase.auth.getSession();
    const patch = newDone
      ? { done: true, done_at: new Date().toISOString(), done_by: session?.user?.id || null }
      : { done: false, done_at: null, done_by: null };
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, ...patch } : n)));
    const { error } = await supabase.from('notes').update(patch).eq('id', note.id);
    if (error) {
      console.error('note toggle error:', error);
      // revert on error
      setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)));
    }
  };

  const deleteNote = async (note) => {
    Alert.alert('Delete note', `"${note.body.slice(0, 60)}${note.body.length > 60 ? '…' : ''}"`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setNotes((prev) => prev.filter((n) => n.id !== note.id));
          await supabase.from('notes').delete().eq('id', note.id);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Ionicons name="chevron-back" size={28} color={C.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: '800', color: C.text, flex: 1 }}>Notes</Text>
        <Text style={{ fontSize: 12, color: C.textSecondary }}>{counts.open} open</Text>
      </View>

      {/* Filter chips */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
        {[
          { id: 'open', label: 'Open', count: counts.open },
          { id: 'done', label: 'Done', count: counts.done },
          { id: 'all', label: 'All', count: counts.all },
        ].map((f) => {
          const active = filter === f.id;
          return (
            <TouchableOpacity
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 9999,
                backgroundColor: active ? C.primaryDark : C.bgCard,
              }}
            >
              <Text style={{ color: active ? '#fff' : C.text, fontWeight: '700', fontSize: 13 }}>
                {f.label} <Text style={{ color: active ? 'rgba(255,255,255,0.7)' : C.textMuted, fontWeight: '500' }}>{f.count}</Text>
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* List */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {loading ? (
          <View style={{ padding: 24, alignItems: 'center' }}><ActivityIndicator color={C.primaryDark} /></View>
        ) : filtered.length === 0 ? (
          <View style={{ padding: 32, alignItems: 'center' }}>
            <Text style={{ color: C.textMuted, fontSize: 14, textAlign: 'center' }}>
              {filter === 'open'
                ? 'Nothing pending 🎉\nAdd a note below when something comes up'
                : filter === 'done'
                ? 'No notes marked as done yet'
                : 'No notes yet. Add the first one below.'}
            </Text>
          </View>
        ) : (
          filtered.map((note) => (
            <View
              key={note.id}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 12,
                backgroundColor: C.bgCard,
                borderRadius: 12,
                padding: 14,
                marginBottom: 10,
                opacity: note.done ? 0.6 : 1,
              }}
            >
              <TouchableOpacity onPress={() => toggleDone(note)} style={{ paddingTop: 2 }}>
                <Ionicons
                  name={note.done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={note.done ? C.success : C.textMuted}
                />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontSize: 15,
                  color: C.text,
                  lineHeight: 20,
                  textDecorationLine: note.done ? 'line-through' : 'none',
                }}>
                  {note.body}
                </Text>
                <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                  {new Date(note.created_at).toLocaleString('en-US', {
                    month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </Text>
              </View>
              <TouchableOpacity onPress={() => deleteNote(note)} style={{ paddingTop: 2 }}>
                <Ionicons name="trash-outline" size={18} color={C.textMuted} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      {/* Composer */}
      <View style={{
        flexDirection: 'row',
        gap: 8,
        padding: 12,
        borderTopWidth: 1,
        borderTopColor: C.border,
        backgroundColor: C.bg,
      }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Jot something down..."
          placeholderTextColor={C.textMuted}
          multiline
          style={{
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
          }}
        />
        <TouchableOpacity
          onPress={addNote}
          disabled={saving || !draft.trim()}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: C.primaryDark,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: saving || !draft.trim() ? 0.4 : 1,
          }}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="add" size={26} color="#fff" />}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
