import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  SafeAreaView, StyleSheet, Switch, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  createCompanyWithSetup,
  slugify,
  isSlugAvailable,
  DEFAULT_PRICING,
  SERVICE_OPTIONS,
  DEFAULT_POLICIES,
} from '../src/lib/onboarding';

const C = {
  bg: '#FFFFFF',
  surface: '#F7F7F7',
  border: '#E8E8E8',
  primary: '#ffb77d',
  primaryDark: '#ff8c00',
  text: '#1A1A1A',
  textMuted: '#666666',
  textLight: '#999999',
  success: '#00C853',
  danger: '#FF3D00',
};

const STEPS = [
  { id: 'company', title: 'Empresa', icon: 'business' },
  { id: 'area', title: 'Zona', icon: 'location' },
  { id: 'fleet', title: 'Flota', icon: 'cube' },
  { id: 'services', title: 'Servicios', icon: 'construct' },
  { id: 'pricing', title: 'Precios', icon: 'cash' },
  { id: 'policies', title: 'Políticas', icon: 'document-text' },
  { id: 'team', title: 'Equipo', icon: 'people' },
  { id: 'summary', title: 'Confirmar', icon: 'checkmark-circle' },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [stepIdx, setStepIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  // Form state
  const [company, setCompany] = useState({
    name: '', slug: '', phone: '', email: '', website: '', timezone: 'America/Los_Angeles',
  });
  const [slugStatus, setSlugStatus] = useState(null); // null | 'available' | 'taken'
  const [serviceCities, setServiceCities] = useState('');
  const [serviceZips, setServiceZips] = useState('');
  const [fleet, setFleet] = useState({ 10: 0, 20: 0, 30: 0, 40: 0 });
  const [services, setServices] = useState([]);
  const [pricing, setPricing] = useState({}); // { "General Debris-10": 649, ... }
  const [policies, setPolicies] = useState({ ...DEFAULT_POLICIES });
  const [drivers, setDrivers] = useState([{ name: '', phone: '', email: '' }]);

  const currentStep = STEPS[stepIdx];

  // Auto-generate slug from name
  const updateName = (name) => {
    const slug = slugify(name);
    setCompany({ ...company, name, slug });
    setSlugStatus(null);
  };

  const checkSlug = async () => {
    if (!company.slug) return;
    const ok = await isSlugAvailable(company.slug);
    setSlugStatus(ok ? 'available' : 'taken');
  };

  // Init pricing defaults when services/fleet changes
  const initPricingDefaults = () => {
    const sizes = Object.keys(fleet).filter(s => fleet[s] > 0).map(Number);
    const newPricing = {};
    services.forEach(svc => {
      sizes.forEach(size => {
        const key = `${svc}-${size}`;
        if (pricing[key] == null) {
          newPricing[key] = DEFAULT_PRICING[svc]?.[size] ?? 699;
        } else {
          newPricing[key] = pricing[key];
        }
      });
    });
    setPricing(newPricing);
  };

  const validateStep = () => {
    if (currentStep.id === 'company') {
      if (!company.name || !company.phone || !company.email) return 'Faltan campos requeridos';
      if (slugStatus === 'taken') return 'El slug ya está en uso';
    }
    if (currentStep.id === 'fleet') {
      const total = Object.values(fleet).reduce((a, b) => a + (+b || 0), 0);
      if (total === 0) return 'Agrega al menos 1 dumpster';
    }
    if (currentStep.id === 'services') {
      if (services.length === 0) return 'Elige al menos 1 servicio';
    }
    return null;
  };

  const next = () => {
    const err = validateStep();
    if (err) return Alert.alert('Revisa', err);
    // On entering pricing step, initialize defaults
    if (STEPS[stepIdx + 1]?.id === 'pricing') initPricingDefaults();
    setStepIdx(i => Math.min(i + 1, STEPS.length - 1));
  };

  const back = () => setStepIdx(i => Math.max(i - 1, 0));

  const submit = async () => {
    setLoading(true);
    const pricingList = Object.entries(pricing).map(([key, price]) => {
      const [svc, size] = key.split('-');
      return { service: svc, size: parseInt(size, 10), price: parseFloat(price) };
    });
    const validDrivers = drivers.filter(d => d.name);
    const zips = serviceZips.split(/[\s,\n]+/).filter(Boolean);
    const cities = serviceCities.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);

    const result = await createCompanyWithSetup({
      ...company,
      serviceZips: zips,
      serviceCities: cities,
      fleet,
      services,
      pricing: pricingList,
      policies,
      drivers: validDrivers,
    });

    setLoading(false);

    if (result.error) {
      Alert.alert('Error', result.error);
    } else {
      Alert.alert('¡Listo!', `Tu empresa "${result.company.name}" quedó registrada. Bienvenido a Dumpsterin.`, [
        { text: 'Ir al dashboard', onPress: () => router.replace('/(tabs)') },
      ]);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${((stepIdx + 1) / STEPS.length) * 100}%` }]} />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.stepLabel}>Paso {stepIdx + 1} de {STEPS.length}</Text>
        <Text style={styles.stepTitle}>{currentStep.title}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {currentStep.id === 'company' && (
          <CompanyStep
            company={company}
            setCompany={setCompany}
            updateName={updateName}
            checkSlug={checkSlug}
            slugStatus={slugStatus}
          />
        )}
        {currentStep.id === 'area' && (
          <AreaStep
            cities={serviceCities}
            setCities={setServiceCities}
            zips={serviceZips}
            setZips={setServiceZips}
          />
        )}
        {currentStep.id === 'fleet' && (
          <FleetStep fleet={fleet} setFleet={setFleet} />
        )}
        {currentStep.id === 'services' && (
          <ServicesStep services={services} setServices={setServices} />
        )}
        {currentStep.id === 'pricing' && (
          <PricingStep
            services={services}
            fleet={fleet}
            pricing={pricing}
            setPricing={setPricing}
          />
        )}
        {currentStep.id === 'policies' && (
          <PoliciesStep policies={policies} setPolicies={setPolicies} />
        )}
        {currentStep.id === 'team' && (
          <TeamStep drivers={drivers} setDrivers={setDrivers} />
        )}
        {currentStep.id === 'summary' && (
          <SummaryStep
            company={company}
            fleet={fleet}
            services={services}
            drivers={drivers.filter(d => d.name)}
            policies={policies}
          />
        )}
      </ScrollView>

      {/* Nav buttons */}
      <View style={styles.navBar}>
        {stepIdx > 0 ? (
          <TouchableOpacity style={styles.btnSecondary} onPress={back} disabled={loading}>
            <Ionicons name="arrow-back" size={18} color={C.text} />
            <Text style={styles.btnSecondaryText}>Atrás</Text>
          </TouchableOpacity>
        ) : <View style={{ width: 100 }} />}

        {stepIdx < STEPS.length - 1 ? (
          <TouchableOpacity style={styles.btnPrimary} onPress={next}>
            <Text style={styles.btnPrimaryText}>Siguiente</Text>
            <Ionicons name="arrow-forward" size={18} color="white" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.btnPrimary} onPress={submit} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Text style={styles.btnPrimaryText}>Confirmar</Text>
                <Ionicons name="checkmark" size={18} color="white" />
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

// ━━━ Step components ━━━

function CompanyStep({ company, setCompany, updateName, checkSlug, slugStatus }) {
  return (
    <View style={{ gap: 14 }}>
      <Field label="Nombre de la empresa *">
        <TextInput
          style={styles.input}
          value={company.name}
          onChangeText={updateName}
          placeholder="Ej: TP Dumpsters"
          placeholderTextColor={C.textLight}
        />
      </Field>
      <Field label="Slug (identificador único)">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={company.slug}
            onChangeText={slug => setCompany({ ...company, slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
            placeholder="tp-dumpsters"
            placeholderTextColor={C.textLight}
            onBlur={checkSlug}
          />
          {slugStatus === 'available' && <Ionicons name="checkmark-circle" size={28} color={C.success} />}
          {slugStatus === 'taken' && <Ionicons name="close-circle" size={28} color={C.danger} />}
        </View>
      </Field>
      <Field label="Teléfono *">
        <TextInput
          style={styles.input}
          value={company.phone}
          onChangeText={phone => setCompany({ ...company, phone })}
          placeholder="+1 510 650 2083"
          keyboardType="phone-pad"
          placeholderTextColor={C.textLight}
        />
      </Field>
      <Field label="Email *">
        <TextInput
          style={styles.input}
          value={company.email}
          onChangeText={email => setCompany({ ...company, email })}
          placeholder="contact@tudumpsters.com"
          keyboardType="email-address"
          autoCapitalize="none"
          placeholderTextColor={C.textLight}
        />
      </Field>
      <Field label="Sitio web (opcional)">
        <TextInput
          style={styles.input}
          value={company.website}
          onChangeText={website => setCompany({ ...company, website })}
          placeholder="tudumpsters.com"
          autoCapitalize="none"
          placeholderTextColor={C.textLight}
        />
      </Field>
    </View>
  );
}

function AreaStep({ cities, setCities, zips, setZips }) {
  return (
    <View style={{ gap: 14 }}>
      <Text style={styles.helpText}>
        Indícanos dónde das servicio. Puedes usar ciudades o códigos postales (uno por línea o separados por comas).
      </Text>
      <Field label="Ciudades">
        <TextInput
          style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
          value={cities}
          onChangeText={setCities}
          placeholder="Oakland, Berkeley, Fremont, San Francisco..."
          multiline
          placeholderTextColor={C.textLight}
        />
      </Field>
      <Field label="Zip codes (opcional)">
        <TextInput
          style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
          value={zips}
          onChangeText={setZips}
          placeholder="94601, 94602, 94603..."
          multiline
          placeholderTextColor={C.textLight}
        />
      </Field>
    </View>
  );
}

function FleetStep({ fleet, setFleet }) {
  const sizes = [10, 20, 30, 40];
  const total = sizes.reduce((a, s) => a + (fleet[s] || 0), 0);
  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.helpText}>
        ¿Cuántos dumpsters tienes de cada tamaño?
      </Text>
      <View style={styles.fleetTotal}>
        <Text style={styles.fleetTotalText}>Total: {total} dumpsters</Text>
      </View>
      {sizes.map(size => (
        <View key={size} style={styles.fleetRow}>
          <Text style={styles.fleetLabel}>{size} yardas</Text>
          <View style={styles.stepper}>
            <TouchableOpacity style={styles.stepperBtn} onPress={() => setFleet({ ...fleet, [size]: Math.max(0, (fleet[size] || 0) - 1) })}>
              <Ionicons name="remove" size={20} color={C.text} />
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{fleet[size] || 0}</Text>
            <TouchableOpacity style={styles.stepperBtn} onPress={() => setFleet({ ...fleet, [size]: (fleet[size] || 0) + 1 })}>
              <Ionicons name="add" size={20} color={C.text} />
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}

function ServicesStep({ services, setServices }) {
  const toggle = (svc) => {
    setServices(services.includes(svc) ? services.filter(s => s !== svc) : [...services, svc]);
  };
  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.helpText}>Selecciona todos los tipos de residuos que manejas.</Text>
      {SERVICE_OPTIONS.map(svc => (
        <TouchableOpacity key={svc} style={[styles.serviceRow, services.includes(svc) && styles.serviceRowActive]} onPress={() => toggle(svc)}>
          <Ionicons
            name={services.includes(svc) ? 'checkbox' : 'square-outline'}
            size={22}
            color={services.includes(svc) ? C.primary : C.textMuted}
          />
          <Text style={styles.serviceLabel}>{svc}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function PricingStep({ services, fleet, pricing, setPricing }) {
  const sizes = [10, 20, 30, 40].filter(s => (fleet[s] || 0) > 0);
  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.helpText}>
        Precio base por servicio y tamaño. Pre-llenamos con sugeridos del mercado; puedes editar.
      </Text>
      {services.map(svc => (
        <View key={svc} style={styles.pricingBlock}>
          <Text style={styles.pricingTitle}>{svc}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {sizes.map(size => (
              <View key={size} style={{ flex: 1 }}>
                <Text style={styles.pricingSizeLabel}>{size}yd</Text>
                <View style={styles.pricingInput}>
                  <Text style={styles.pricingDollar}>$</Text>
                  <TextInput
                    style={styles.pricingValue}
                    value={String(pricing[`${svc}-${size}`] ?? '')}
                    onChangeText={v => setPricing({ ...pricing, [`${svc}-${size}`]: v })}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function PoliciesStep({ policies, setPolicies }) {
  const upd = (k, v) => setPolicies({ ...policies, [k]: v });
  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.helpText}>Términos estándar de tu renta (puedes editar cada caso después).</Text>

      <PolicyRow label="Duración del rental (días)" value={String(policies.rentalDays)} onChange={v => upd('rentalDays', parseInt(v) || 0)} />
      <PolicyRow label="Día extra ($)" value={String(policies.extraDayRate)} onChange={v => upd('extraDayRate', parseFloat(v) || 0)} />
      <PolicyRow label="Sobrepeso ($/ton)" value={String(policies.overweightPerTon)} onChange={v => upd('overweightPerTon', parseFloat(v) || 0)} />
      <PolicyRow label="Fee colchón ($)" value={String(policies.mattressFee)} onChange={v => upd('mattressFee', parseFloat(v) || 0)} />
      <PolicyRow label="Fee appliance ($)" value={String(policies.applianceFee)} onChange={v => upd('applianceFee', parseFloat(v) || 0)} />
      <PolicyRow label="Fee llanta ($)" value={String(policies.tireFee)} onChange={v => upd('tireFee', parseFloat(v) || 0)} />
      <PolicyRow label="Fee electrónicos ($)" value={String(policies.electronicsFee)} onChange={v => upd('electronicsFee', parseFloat(v) || 0)} />
      <PolicyRow label="Cargo cancelación ($)" value={String(policies.cancellationFee)} onChange={v => upd('cancellationFee', parseFloat(v) || 0)} />
      <PolicyRow label="Aviso cancelación (hrs)" value={String(policies.cancellationNoticeHours)} onChange={v => upd('cancellationNoticeHours', parseInt(v) || 0)} />

      <View style={styles.switchRow}>
        <Text style={styles.fieldLabel}>Entrega same-day disponible</Text>
        <Switch value={policies.sameDay} onValueChange={v => upd('sameDay', v)} trackColor={{ true: C.primary }} />
      </View>
    </View>
  );
}

function TeamStep({ drivers, setDrivers }) {
  const updateDriver = (idx, field, value) => {
    const copy = [...drivers];
    copy[idx] = { ...copy[idx], [field]: value };
    setDrivers(copy);
  };
  const addDriver = () => setDrivers([...drivers, { name: '', phone: '', email: '' }]);
  const removeDriver = (idx) => setDrivers(drivers.filter((_, i) => i !== idx));

  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.helpText}>Agrega a tus drivers (puedes saltar este paso y agregar después).</Text>
      {drivers.map((d, idx) => (
        <View key={idx} style={styles.driverCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.driverTitle}>Driver {idx + 1}</Text>
            {drivers.length > 1 && (
              <TouchableOpacity onPress={() => removeDriver(idx)}>
                <Ionicons name="trash-outline" size={20} color={C.danger} />
              </TouchableOpacity>
            )}
          </View>
          <TextInput
            style={styles.input}
            placeholder="Nombre"
            placeholderTextColor={C.textLight}
            value={d.name}
            onChangeText={v => updateDriver(idx, 'name', v)}
          />
          <TextInput
            style={styles.input}
            placeholder="Teléfono"
            placeholderTextColor={C.textLight}
            keyboardType="phone-pad"
            value={d.phone}
            onChangeText={v => updateDriver(idx, 'phone', v)}
          />
          <TextInput
            style={styles.input}
            placeholder="Email (opcional)"
            placeholderTextColor={C.textLight}
            keyboardType="email-address"
            autoCapitalize="none"
            value={d.email}
            onChangeText={v => updateDriver(idx, 'email', v)}
          />
        </View>
      ))}
      <TouchableOpacity style={styles.addDriverBtn} onPress={addDriver}>
        <Ionicons name="add-circle-outline" size={22} color={C.primaryDark} />
        <Text style={{ color: C.primaryDark, fontWeight: '600' }}>Agregar otro driver</Text>
      </TouchableOpacity>
    </View>
  );
}

function SummaryStep({ company, fleet, services, drivers, policies }) {
  const total = Object.values(fleet).reduce((a, b) => a + (+b || 0), 0);
  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.helpText}>Revisa tu setup antes de confirmar.</Text>
      <SummaryCard title={company.name || 'Tu empresa'}>
        <SumLine label="Teléfono" value={company.phone} />
        <SumLine label="Email" value={company.email} />
        <SumLine label="Sitio web" value={company.website || '(sin website)'} />
      </SummaryCard>
      <SummaryCard title={`Flota: ${total} dumpsters`}>
        {Object.entries(fleet).filter(([_, v]) => v > 0).map(([s, v]) => (
          <SumLine key={s} label={`${s} yardas`} value={`${v} unidades`} />
        ))}
      </SummaryCard>
      <SummaryCard title={`Servicios (${services.length})`}>
        <Text style={{ color: C.textMuted }}>{services.join(', ') || '(ninguno)'}</Text>
      </SummaryCard>
      <SummaryCard title="Políticas">
        <SumLine label="Duración" value={`${policies.rentalDays} días`} />
        <SumLine label="Día extra" value={`$${policies.extraDayRate}`} />
        <SumLine label="Sobrepeso" value={`$${policies.overweightPerTon}/ton`} />
        <SumLine label="Same-day" value={policies.sameDay ? 'Sí' : 'No'} />
      </SummaryCard>
      <SummaryCard title={`Equipo: ${drivers.length} drivers`}>
        {drivers.length === 0 ? (
          <Text style={{ color: C.textMuted }}>(Puedes agregar drivers después)</Text>
        ) : (
          drivers.map((d, i) => <SumLine key={i} label={d.name} value={d.phone} />)
        )}
      </SummaryCard>
    </View>
  );
}

// ━━━ Small helpers ━━━

function Field({ label, children }) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function PolicyRow({ label, value, onChange }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text style={[styles.fieldLabel, { flex: 1, marginBottom: 0 }]}>{label}</Text>
      <TextInput
        style={[styles.input, { width: 100, textAlign: 'right' }]}
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
      />
    </View>
  );
}

function SummaryCard({ title, children }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>{title}</Text>
      <View style={{ gap: 4 }}>{children}</View>
    </View>
  );
}

function SumLine({ label, value }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ color: C.textMuted }}>{label}</Text>
      <Text style={{ color: C.text, fontWeight: '500' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  progressBar: { height: 4, backgroundColor: C.border, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: C.primaryDark },
  header: { paddingHorizontal: 24, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  stepLabel: { fontSize: 13, color: C.textLight, marginBottom: 4 },
  stepTitle: { fontSize: 28, fontWeight: '700', color: C.text },
  scroll: { flex: 1 },
  scrollContent: { padding: 24 },
  fieldLabel: { fontSize: 14, fontWeight: '500', color: C.text, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 14, fontSize: 15, backgroundColor: 'white', color: C.text },
  helpText: { color: C.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 4 },
  navBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: 'white' },
  btnPrimary: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 14, backgroundColor: C.primaryDark, borderRadius: 10 },
  btnPrimaryText: { color: 'white', fontWeight: '600', fontSize: 15 },
  btnSecondary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  btnSecondaryText: { color: C.text, fontWeight: '500' },
  fleetTotal: { padding: 14, backgroundColor: C.surface, borderRadius: 10, alignItems: 'center' },
  fleetTotalText: { fontSize: 18, fontWeight: '600', color: C.text },
  fleetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 14, backgroundColor: 'white', borderRadius: 10, borderWidth: 1, borderColor: C.border },
  fleetLabel: { fontSize: 16, color: C.text },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepperBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { width: 40, textAlign: 'center', fontSize: 16, fontWeight: '600', color: C.text },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: 'white', borderRadius: 10, borderWidth: 1, borderColor: C.border },
  serviceRowActive: { borderColor: C.primary, backgroundColor: '#FFF9F2' },
  serviceLabel: { fontSize: 15, color: C.text, flex: 1 },
  pricingBlock: { padding: 14, backgroundColor: C.surface, borderRadius: 10 },
  pricingTitle: { fontWeight: '600', fontSize: 15, color: C.text, marginBottom: 10 },
  pricingSizeLabel: { fontSize: 12, color: C.textMuted, marginBottom: 4, textAlign: 'center' },
  pricingInput: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 8 },
  pricingDollar: { color: C.textMuted, fontSize: 14 },
  pricingValue: { flex: 1, padding: 10, fontSize: 15, color: C.text },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  driverCard: { padding: 14, backgroundColor: C.surface, borderRadius: 10, gap: 10 },
  driverTitle: { fontWeight: '600', color: C.text, fontSize: 14 },
  addDriverBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 14, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: C.border },
  summaryCard: { padding: 14, backgroundColor: C.surface, borderRadius: 10 },
  summaryTitle: { fontWeight: '600', fontSize: 15, color: C.text, marginBottom: 8 },
});
