'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import Image from 'next/image'
import {
  Bot,
  Check,
  ChevronDown,
  CircleCheckBig,
  Copy,
  CreditCard,
  Gift,
  Globe,
  Heart,
  Lock,
  MapPin,
  Megaphone,
  Monitor,
  Plus,
  QrCode,
  RotateCcw,
  Share2,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Smartphone,
  Store,
  Tag,
  Terminal,
  Timer,
  TrendingDown,
  Truck,
  Users,
  Wallet,
  Zap,
} from 'lucide-react'
import { STRINGS, formatBRL, type Lang } from './i18n'

type BuyerProfile = 'new' | 'pix' | 'card'
type Device = 'mobile' | 'desktop'
type PaymentMethod = 'pix' | 'card' | 'koin'
type ShippingOption = 'standard' | 'express' | 'pickup'
type Toggles = {
  paymentMix: boolean
  socialShare: boolean
  vtexAds: boolean
  saveForLater: boolean
  coupons: boolean
  pickup: boolean
}
type EnabledMethods = Record<PaymentMethod, boolean>

// Nome e variante de cada produto vêm do dicionário de idioma (i18n.ts), pelo id.
type CartItem = {
  id: string
  price: number
  image: string
  upsell?: boolean
}

const CART: CartItem[] = [
  { id: 'tenis', price: 400, image: '/products/tenis.png' },
  { id: 'meia', price: 50, image: '/products/meia.png' },
]

const UPSELL_PRODUCTS: CartItem[] = [
  { id: 'cadarco', price: 29.9, image: '/products/cadarco.png', upsell: true },
  { id: 'palmilha', price: 29.9, image: '/products/palmilha.png', upsell: true },
  { id: 'spray', price: 24.9, image: '/products/spray.png', upsell: true },
]

const PROFILES: BuyerProfile[] = ['new', 'pix', 'card']

// Histórico de pedidos que o motor lê para inferir o segmento (o resumo legível fica no i18n).
const BUYER_HISTORY_SIGNAL: Record<BuyerProfile, string> = {
  new: 'orders = 0',
  pix: 'orders = 4 · pix_share = 75%',
  card: 'orders = 6 · card_share = 83% · avg = 6x',
}

const PREFERRED_METHOD: Record<BuyerProfile, PaymentMethod | null> = {
  new: null,
  pix: 'pix',
  card: 'card',
}

const SHIPPING_PRICE: Record<ShippingOption, number> = {
  standard: 14.9,
  express: 24.9,
  pickup: 0,
}

const PIX_DISCOUNT_RATE = 0.05
const WARRANTY_PRICE = 39.9
const MAX_MIXED_METHODS = 2
const PIX_TIMER_SECONDS = 10 * 60
const ORDER_ID = 'AM-240927'

type Coupon = { code: string; type: 'percent' | 'shipping'; value: number }

const COUPONS: Record<string, Coupon> = {
  BEMVINDO10: { code: 'BEMVINDO10', type: 'percent', value: 0.1 },
  FRETEGRATIS: { code: 'FRETEGRATIS', type: 'shipping', value: 0 },
}

/* Idioma: o componente raiz guarda o idioma e o repassa por contexto. */
const LangContext = createContext<Lang>('pt')

function useI18n() {
  const lang = useContext(LangContext)
  return { lang, s: STRINGS[lang], brl: (value: number) => formatBRL(value, lang) }
}

/* ------------------------------------------------------------------ */
/* Motor de personalização                                             */
/* Função pura: recebe sinais do comprador + regras do lojista e       */
/* devolve o que o checkout deve mostrar, com o porquê de cada decisão. */
/* Em produção isso seria um serviço (regras → modelo), aqui é local.   */
/* ------------------------------------------------------------------ */

type DecisionSource = 'engine' | 'merchant' | 'buyer'
type Decision = {
  source: DecisionSource
  signal: string
  action: string
  hypothesis?: string
  kpi?: string
  guardrail?: string
}

const MIN_INSTALLMENT_VALUE = 50
const INSTALLMENT_TIERS = [
  { from: 0, max: 3 },
  { from: 300, max: 6 },
  { from: 500, max: 10 },
]
const THRESHOLD_NUDGE_WINDOW = 100

const tierFor = (value: number) => [...INSTALLMENT_TIERS].reverse().find((t) => value >= t.from) ?? INSTALLMENT_TIERS[0]
const nextTierFor = (value: number) => INSTALLMENT_TIERS.find((t) => t.from > value)

function methodOrderFor(profile: BuyerProfile, device: Device, enabled: EnabledMethods): PaymentMethod[] {
  const preferred = PREFERRED_METHOD[profile]
  let order: PaymentMethod[]
  if (preferred === 'pix') order = ['pix', 'card', 'koin']
  else if (preferred === 'card') order = ['card', 'pix', 'koin']
  else order = device === 'mobile' ? ['pix', 'card', 'koin'] : ['card', 'pix', 'koin']
  return order.filter((m) => enabled[m])
}

function defaultMethodsFor(profile: BuyerProfile, device: Device, enabled: EnabledMethods): PaymentMethod[] {
  const order = methodOrderFor(profile, device, enabled)
  if (order.length === 1) return order
  const preferred = PREFERRED_METHOD[profile]
  if (!preferred) return []
  return enabled[preferred] ? [preferred] : order.slice(0, 1)
}

type EngineInput = {
  lang: Lang
  profile: BuyerProfile
  device: Device
  enabled: EnabledMethods
  paymentMix: boolean
  pickup: boolean
  selectedMethods: PaymentMethod[]
  cartValue: number
  cardAmount: number
  shippingAlreadyFree: boolean
}

type EngineOutput = {
  methodOrder: PaymentMethod[]
  mixAvailable: boolean
  pixNudge: boolean
  warrantyUpsell: boolean
  pixMode: 'qr' | 'copy'
  maxInstallments: number
  installmentsLimitedByMin: boolean
  thresholdNudge: { missing: number; max: number } | null
  pickupAvailable: boolean
  pickupRecommended: boolean
  decisions: Decision[]
}

function runEngine(i: EngineInput): EngineOutput {
  const t = STRINGS[i.lang].engine
  const methodName = STRINGS[i.lang].method
  const brl = (value: number) => formatBRL(value, i.lang)
  const decisions: Decision[] = []
  const methodOrder = methodOrderFor(i.profile, i.device, i.enabled)
  const preferred = PREFERRED_METHOD[i.profile]

  // 1. Segmento do comprador
  if (i.profile === 'new') {
    decisions.push({
      source: 'engine',
      signal: `${BUYER_HISTORY_SIGNAL.new} → segment = new_user`,
      action: 'mount(signup_lite) + lock(shipping.express = free)',
      hypothesis: t.newHyp,
      kpi: t.newKpi,
      guardrail: t.newGuard,
    })
  }
  if (preferred && !i.enabled[preferred]) {
    decisions.push({
      source: 'engine',
      signal: `segment = ${preferred}_affinity · merchant.${preferred} = off`,
      action: methodOrder[0] ? `fallback → expand(${methodOrder[0]})` : t.fallbackNone,
      hypothesis: t.fallbackHyp,
    })
  } else if (i.profile === 'card') {
    decisions.push({
      source: 'engine',
      signal: `${BUYER_HISTORY_SIGNAL.card} → segment = card_affinity`,
      action: t.cardAction,
      hypothesis: t.cardHyp,
      kpi: t.cardKpi,
      guardrail: t.cardGuard,
    })
  } else if (i.profile === 'pix') {
    decisions.push({
      source: 'engine',
      signal: `${BUYER_HISTORY_SIGNAL.pix} → segment = pix_affinity`,
      action: 'expand(pix) + inject(upsell_warranty, 1-click)',
      hypothesis: t.pixHyp,
      kpi: t.pixKpi,
      guardrail: t.conversion,
    })
  }

  const pixNudge = i.profile === 'card' && i.enabled.pix
  if (i.profile === 'card') {
    decisions.push(
      i.enabled.pix
        ? {
            source: 'engine',
            signal: 'segment = card_affinity · merchant.pix = on',
            action: t.nudgeAction,
            hypothesis: t.nudgeHyp,
            kpi: t.nudgeKpi,
            guardrail: t.totalConversion,
          }
        : {
            source: 'engine',
            signal: 'merchant.pix = off',
            action: t.nudgeOffAction,
            hypothesis: t.nudgeOffHyp,
          },
    )
  }

  // 2. Dispositivo (sinal em tempo real)
  const pixMode = i.device === 'mobile' ? 'copy' : 'qr'
  if (i.enabled.pix) {
    decisions.push({
      source: 'engine',
      signal: `device = ${i.device}`,
      action: i.device === 'mobile' ? t.mobileAction(!preferred) : 'pix.mode = qr_code',
      hypothesis: i.device === 'mobile' ? t.mobileHyp : t.desktopHyp,
      kpi: t.pixPaidKpi,
    })
  }

  // 3. Valor do carrinho → política de parcelamento (sinal em tempo real)
  const tier = tierFor(i.cartValue)
  const byMinInstallment = Math.max(1, Math.floor(i.cardAmount / MIN_INSTALLMENT_VALUE))
  const maxInstallments = Math.min(tier.max, byMinInstallment)
  const installmentsLimitedByMin = byMinInstallment < tier.max
  const cardRelevant = i.enabled.card && (i.profile === 'card' || i.selectedMethods.includes('card'))
  let thresholdNudge: EngineOutput['thresholdNudge'] = null

  if (i.enabled.card) {
    decisions.push({
      source: 'engine',
      signal: `cart.value = ${brl(i.cartValue)}`,
      action: t.installmentsAction(maxInstallments, installmentsLimitedByMin ? brl(MIN_INSTALLMENT_VALUE) : null),
      hypothesis: t.installmentsHyp,
      kpi: t.cardKpi,
      guardrail: t.installmentsGuard,
    })
    const next = nextTierFor(i.cartValue)
    if (cardRelevant && next && next.from - i.cartValue <= THRESHOLD_NUDGE_WINDOW) {
      const missing = next.from - i.cartValue
      thresholdNudge = { missing, max: next.max }
      decisions.push({
        source: 'engine',
        signal: t.thresholdSignal(brl(missing)),
        action: t.thresholdAction(brl(missing), next.max),
        hypothesis: t.thresholdHyp,
        kpi: 'AOV',
        guardrail: t.abandonment,
      })
    }
  }

  // 4. Regras do lojista que dependem de contexto
  const mixAvailable = i.paymentMix && methodOrder.length >= 2
  if (i.paymentMix && !mixAvailable) {
    decisions.push({
      source: 'engine',
      signal: t.mixOffSignal,
      action: 'suppress(payment_mix)',
      hypothesis: t.mixOffHyp,
    })
  }
  if (methodOrder.length === 1) {
    decisions.push({
      source: 'engine',
      signal: t.onlyOneSignal(methodName[methodOrder[0]]),
      action: `autoselect(${methodOrder[0]})`,
      hypothesis: t.onlyOneHyp,
    })
  }

  const pickupAvailable = i.pickup && i.profile !== 'new'
  const pickupRecommended = pickupAvailable && !i.shippingAlreadyFree
  if (i.pickup) {
    decisions.push(
      pickupAvailable
        ? {
            source: 'engine',
            signal: t.pickupSignal,
            action: pickupRecommended ? t.pickupRecommended : t.pickupNotRecommended,
            hypothesis: t.pickupHyp,
            kpi: t.pickupKpi,
            guardrail: t.pickupGuard,
          }
        : {
            source: 'engine',
            signal: t.pickupHiddenSignal,
            action: t.pickupHiddenAction,
            hypothesis: t.pickupHiddenHyp,
          },
    )
  }

  return {
    methodOrder,
    mixAvailable,
    pixNudge,
    warrantyUpsell: i.profile === 'pix',
    pixMode,
    maxInstallments,
    installmentsLimitedByMin,
    thresholdNudge,
    pickupAvailable,
    pickupRecommended,
    decisions,
  }
}

function Collapse({
  open,
  children,
  className = '',
  innerClassName,
}: {
  open: boolean
  children: ReactNode
  className?: string
  // Espaçamento aplicado dentro da área recolhível: some junto quando fechado.
  innerClassName?: string
}) {
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-500 ease-out ${
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      } ${className}`}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="min-h-0 overflow-hidden">
        {innerClassName ? <div className={innerClassName}>{children}</div> : children}
      </div>
    </div>
  )
}

function ExtensionBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/40 bg-primary/5 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-primary">
      <Zap className="size-3" aria-hidden="true" />
      {label}
    </span>
  )
}

function WhatsAppIcon({ className = '' }: { className?: string }) {
  return <img src="/icons/whatsapp.svg" alt="" aria-hidden="true" className={`invert ${className}`} />
}

export default function ModularCheckout() {
  // Camada 1 · sinais do comprador
  const [profile, setProfile] = useState<BuyerProfile>('card')
  const [device, setDevice] = useState<Device>('desktop')

  // Idioma da interface: PT ou EN, sincronizado com ?lang= na URL para compartilhar a versão certa.
  const [lang, setLang] = useState<Lang>('pt')
  const s = STRINGS[lang]
  const brl = (value: number) => formatBRL(value, lang)

  // Camada 2 · regras do lojista
  const [enabledMethods, setEnabledMethods] = useState<EnabledMethods>({ pix: true, card: true, koin: true })
  const [toggles, setToggles] = useState<Toggles>({
    paymentMix: false,
    socialShare: false,
    vtexAds: false,
    saveForLater: false,
    coupons: false,
    pickup: false,
  })

  // Estado da sessão de checkout
  const [methods, setMethods] = useState<PaymentMethod[]>(['card'])
  const [split, setSplit] = useState(50)
  const [shipping, setShipping] = useState<ShippingOption>('standard')
  const [warranty, setWarranty] = useState(false)
  const [installmentsChoice, setInstallmentsChoice] = useState<number | null>(null)
  const [placed, setPlaced] = useState(false)
  const [wantsSocialShare, setWantsSocialShare] = useState(false)
  const [cartItems, setCartItems] = useState<CartItem[]>(CART)
  const [savedItems, setSavedItems] = useState<CartItem[]>([])
  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null)
  const [couponInvalid, setCouponInvalid] = useState(false)

  // O dispositivo real é o ponto de partida; o painel permite simular o outro.
  useEffect(() => {
    if (window.matchMedia('(max-width: 767px)').matches) setDevice('mobile')
    const fromUrl = new URLSearchParams(window.location.search).get('lang')
    if (fromUrl === 'en' || fromUrl === 'pt') setLang(fromUrl)
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR'
  }, [lang])

  const changeLang = (next: Lang) => {
    setLang(next)
    const url = new URL(window.location.href)
    url.searchParams.set('lang', next)
    window.history.replaceState(null, '', url)
  }

  const isNewUser = profile === 'new'
  const hasFreeShippingUnlock = isNewUser || cartItems.some((i) => i.upsell)
  const couponFreeShipping = toggles.coupons && appliedCoupon?.type === 'shipping'
  const cartValue = cartItems.reduce((sum, item) => sum + item.price, 0)
  const mixAllowed = toggles.paymentMix && Object.values(enabledMethods).filter(Boolean).length >= 2
  const isSplit = mixAllowed && methods.length === MAX_MIXED_METHODS

  const resetCheckout = (nextProfile: BuyerProfile = profile) => {
    setMethods(defaultMethodsFor(nextProfile, device, enabledMethods))
    setSplit(50)
    setShipping('standard')
    setWarranty(false)
    setInstallmentsChoice(null)
    setPlaced(false)
    setWantsSocialShare(false)
    setCartItems(CART)
    setSavedItems([])
    setCouponInput('')
    setAppliedCoupon(null)
    setCouponInvalid(false)
  }

  const changeProfile = (next: BuyerProfile) => {
    setProfile(next)
    resetCheckout(next)
  }

  const changeDevice = (next: Device) => {
    setDevice(next)
    setPlaced(false)
  }

  const setMethodEnabled = (method: PaymentMethod, value: boolean) => {
    const next = { ...enabledMethods, [method]: value }
    if (!Object.values(next).some(Boolean)) return
    setEnabledMethods(next)
    setMethods((current) => {
      const kept = current.filter((m) => next[m])
      return kept.length ? kept : defaultMethodsFor(profile, device, next)
    })
    setSplit(50)
    setPlaced(false)
  }

  const setToggle = (key: keyof Toggles, value: boolean) => {
    setToggles((t) => ({ ...t, [key]: value }))
    if (key === 'paymentMix' && !value) setMethods((m) => m.slice(0, 1))
    if (key === 'socialShare' && !value) setWantsSocialShare(false)
    if (key === 'pickup' && !value && shipping === 'pickup') setShipping('standard')
    if (key === 'coupons' && !value) {
      setAppliedCoupon(null)
      setCouponInput('')
      setCouponInvalid(false)
    }
    if (key === 'saveForLater' && !value && savedItems.length > 0) {
      setCartItems((items) => [...items, ...savedItems])
      setSavedItems([])
    }
    setSplit(50)
    setPlaced(false)
  }

  const saveForLater = (id: string) => {
    setCartItems((items) => {
      const item = items.find((i) => i.id === id)
      if (!item) return items
      setSavedItems((saved) => [...saved, item])
      return items.filter((i) => i.id !== id)
    })
  }

  const moveBackToCart = (id: string) => {
    setSavedItems((saved) => {
      const item = saved.find((i) => i.id === id)
      if (!item) return saved
      setCartItems((items) => [...items, item])
      return saved.filter((i) => i.id !== id)
    })
  }

  const addUpsellItem = (product: CartItem) => {
    setCartItems((items) => (items.some((i) => i.id === product.id) ? items : [...items, product]))
  }

  const applyCoupon = () => {
    const normalized = couponInput.trim().toUpperCase()
    const coupon = COUPONS[normalized]
    if (!coupon) {
      setAppliedCoupon(null)
      setCouponInvalid(true)
      return
    }
    setAppliedCoupon(coupon)
    setCouponInvalid(false)
  }

  const removeCoupon = () => {
    setAppliedCoupon(null)
    setCouponInput('')
    setCouponInvalid(false)
  }

  const toggleMethod = (method: PaymentMethod) => {
    if (!mixAllowed) {
      setMethods([method])
      return
    }
    setMethods((current) => {
      if (current.includes(method)) return current.filter((m) => m !== method)
      if (current.length >= MAX_MIXED_METHODS) return current
      return [...current, method]
    })
    setSplit(50)
  }

  const nudgeToPix = () => {
    if (mixAllowed && methods.length < MAX_MIXED_METHODS && !methods.includes('pix')) {
      setMethods((m) => [...m, 'pix'])
    } else {
      setMethods(['pix'])
    }
  }

  const totals = useMemo(() => {
    const subtotal = cartValue
    const warrantyValue = warranty ? WARRANTY_PRICE : 0
    const shippingValue = hasFreeShippingUnlock || couponFreeShipping ? 0 : SHIPPING_PRICE[shipping]
    const base = subtotal + warrantyValue + shippingValue

    const shares = new Map<PaymentMethod, number>()
    if (methods.length === 1) shares.set(methods[0], 1)
    if (methods.length === 2) {
      shares.set(methods[0], split / 100)
      shares.set(methods[1], 1 - split / 100)
    }

    const pixDiscount = base * (shares.get('pix') ?? 0) * PIX_DISCOUNT_RATE
    const couponDiscount =
      toggles.coupons && appliedCoupon?.type === 'percent' ? (base - pixDiscount) * appliedCoupon.value : 0
    const discount = pixDiscount + couponDiscount
    const orderTotal = base - discount

    // Com Social Share ativo, o cliente só paga a sua metade agora — o mix de
    // pagamentos e os descontos passam a incidir sobre essa metade, não sobre o pedido inteiro.
    const customerShare = toggles.socialShare && wantsSocialShare ? 0.5 : 1
    const total = orderTotal * customerShare
    const friendAmount = orderTotal - total
    const pixSavings = base * customerShare * PIX_DISCOUNT_RATE

    const amounts = methods.map((m) => {
      const share = shares.get(m) ?? 0
      const methodPixDiscount = m === 'pix' ? pixDiscount : 0
      const methodCouponDiscount = couponDiscount * share
      return {
        method: m,
        percent: Math.round(share * 100),
        amount: (base * share - methodPixDiscount - methodCouponDiscount) * customerShare,
      }
    })

    return {
      subtotal,
      warrantyValue,
      shippingValue,
      pixSavings,
      discount,
      couponDiscount,
      orderTotal,
      customerShare,
      friendAmount,
      total,
      amounts,
    }
  }, [
    cartValue,
    warranty,
    hasFreeShippingUnlock,
    couponFreeShipping,
    shipping,
    methods,
    split,
    toggles.coupons,
    appliedCoupon,
    toggles.socialShare,
    wantsSocialShare,
  ])

  const amountFor = (m: PaymentMethod) => totals.amounts.find((a) => a.method === m)?.amount ?? totals.total

  // Camada 3 · decisões do motor
  const engine = useMemo(
    () =>
      runEngine({
        lang,
        profile,
        device,
        enabled: enabledMethods,
        paymentMix: toggles.paymentMix,
        pickup: toggles.pickup,
        selectedMethods: methods,
        cartValue,
        cardAmount: amountFor('card'),
        shippingAlreadyFree: hasFreeShippingUnlock || !!couponFreeShipping,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang, profile, device, enabledMethods, toggles.paymentMix, toggles.pickup, methods, cartValue, totals, hasFreeShippingUnlock, couponFreeShipping],
  )

  const installmentCount = Math.min(
    installmentsChoice ?? (profile === 'card' ? engine.maxInstallments : 1),
    engine.maxInstallments,
  )

  const decisions = useMemo(() => {
    const t = STRINGS[lang].engine
    const log: Decision[] = [...engine.decisions]
    if (toggles.vtexAds)
      log.push({
        source: 'merchant',
        signal: 'app vtex_ads = on · segment',
        action: t.adsAction,
        hypothesis: t.adsHyp,
        kpi: t.adsKpi,
        guardrail: t.checkoutConversion,
      })
    if (toggles.socialShare)
      log.push({
        source: 'merchant',
        signal: 'module social_share = on',
        action: t.shareAction,
        hypothesis: t.shareHyp,
        kpi: t.shareKpi,
        guardrail: t.shareGuard,
      })
    if (toggles.saveForLater)
      log.push({
        source: 'merchant',
        signal: 'app save_for_later = on',
        action: 'mount(cart.save_action)',
        hypothesis: t.saveForLaterHyp,
        kpi: t.saveForLaterKpi,
      })
    if (toggles.coupons)
      log.push({ source: 'merchant', signal: 'module coupons = on', action: 'mount(coupon_input)' })
    if (toggles.socialShare && wantsSocialShare)
      log.push({
        source: 'buyer',
        signal: 'social_share.opt_in = true',
        action: 'pricing.customer_share = 50% · post_purchase.mount(share_link, ttl=2h)',
      })
    if (toggles.vtexAds && cartItems.some((i) => i.upsell))
      log.push({ source: 'buyer', signal: 'cross_sell.added', action: 'shipping.override(free)' })
    if (toggles.coupons && appliedCoupon)
      log.push({
        source: 'buyer',
        signal: `coupon = ${appliedCoupon.code}`,
        action: `pricing.override(${appliedCoupon.type === 'percent' ? `-${appliedCoupon.value * 100}%` : t.couponFreeShipping})`,
      })
    return log
  }, [lang, engine, toggles, wantsSocialShare, cartItems, appliedCoupon])

  const shippingLabel =
    shipping === 'pickup'
      ? s.shippingLabel.pickup
      : isNewUser
        ? s.shippingLabel.newUser
        : totals.shippingValue === 0
          ? s.shippingLabel.free(s.shipping[shipping].label)
          : `${s.shipping[shipping].label} · ${brl(totals.shippingValue)}`

  const confirmOrder = () => {
    setPlaced(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <LangContext.Provider value={lang}>
    <div className="min-h-dvh bg-muted/40">
      <DebugPanel
        lang={lang}
        onLangChange={changeLang}
        profile={profile}
        onProfileChange={changeProfile}
        device={device}
        onDeviceChange={changeDevice}
        cartValue={cartValue}
        maxInstallments={engine.maxInstallments}
        enabledMethods={enabledMethods}
        onMethodEnabled={setMethodEnabled}
        toggles={toggles}
        onToggle={setToggle}
        decisions={decisions}
      />

      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShoppingBag className="size-4" aria-hidden="true" />
            </div>
            <span className="font-semibold tracking-tight">Allmart</span>
          </div>
          <ol className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex" aria-label={s.header.steps}>
            <li className="flex items-center gap-1.5">
              <Check className="size-4 text-success" aria-hidden="true" /> {s.header.cart}
            </li>
            <li aria-hidden="true">/</li>
            <li className={placed ? 'flex items-center gap-1.5' : 'font-medium text-foreground'} aria-current={placed ? undefined : 'step'}>
              {placed && <Check className="size-4 text-success" aria-hidden="true" />} {s.header.deliveryPayment}
            </li>
            <li aria-hidden="true">/</li>
            <li className={placed ? 'font-medium text-foreground' : ''} aria-current={placed ? 'step' : undefined}>
              {s.header.confirmation}
            </li>
          </ol>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-4" aria-hidden="true" /> {s.header.secure}
          </span>
        </div>
      </header>

      {placed ? (
        <SuccessPage
          amounts={totals.amounts}
          total={totals.total}
          friendAmount={totals.friendAmount}
          installments={installmentCount}
          socialShare={toggles.socialShare && wantsSocialShare}
          shippingLabel={shippingLabel}
          pixMode={engine.pixMode}
          onBack={() => resetCheckout()}
        />
      ) : (
        <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 md:px-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:py-10">
          <div className="flex flex-col gap-8">
            <DeliverySection
              isNewUser={isNewUser}
              shipping={shipping}
              onShippingChange={setShipping}
              pickupAvailable={engine.pickupAvailable}
              pickupRecommended={engine.pickupRecommended}
            />

            <Collapse open={toggles.vtexAds}>
              <VtexAdsBanner profile={profile} />
            </Collapse>

            <section aria-labelledby="payment-title" className="flex flex-col gap-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 id="payment-title" className="text-2xl font-semibold tracking-tight">
                    {s.payment.title}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {engine.mixAvailable ? s.payment.subtitleMix(MAX_MIXED_METHODS) : s.payment.subtitle}
                  </p>
                </div>
                {engine.mixAvailable && <ExtensionBadge label="payment-mix" />}
              </div>

              <div
                className="overflow-hidden rounded-xl border bg-background"
                role={engine.mixAvailable ? 'group' : 'radiogroup'}
                aria-label={s.payment.methodsLabel}
              >
                {engine.methodOrder.map((method, index) => {
                  const last = index === engine.methodOrder.length - 1
                  const common = {
                    multi: engine.mixAvailable,
                    selected: methods.includes(method),
                    disabled: isMethodLocked(method, methods, engine.mixAvailable),
                    onSelect: () => toggleMethod(method),
                    last,
                  }

                  if (method === 'pix')
                    return (
                      <PaymentOption
                        key="pix"
                        id="pix"
                        icon={QrCode}
                        title="Pix"
                        description={engine.pixMode === 'copy' ? s.payment.pixDescCopy : s.payment.pixDescQr}
                        badge="-5%"
                        {...common}
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                          <div className="flex size-24 shrink-0 items-center justify-center rounded-lg border bg-muted">
                            {engine.pixMode === 'copy' ? (
                              <Copy className="size-10 text-foreground/80" aria-hidden="true" />
                            ) : (
                              <QrCode className="size-14 text-foreground/80" aria-hidden="true" />
                            )}
                          </div>
                          <div className="text-sm">
                            <p className="font-medium">
                              {s.payment.pixAmount} <span className="text-success tabular-nums">{brl(amountFor('pix'))}</span>
                            </p>
                            <p className="text-muted-foreground">
                              {engine.pixMode === 'copy' ? s.payment.pixHintCopy : s.payment.pixHintQr}
                            </p>
                          </div>
                        </div>
                      </PaymentOption>
                    )

                  if (method === 'card')
                    return (
                      <PaymentOption
                        key="card"
                        id="card"
                        icon={CreditCard}
                        title={s.payment.cardTitle}
                        description={
                          engine.maxInstallments > 1 ? s.payment.cardUpTo(engine.maxInstallments) : s.payment.cardFull
                        }
                        {...common}
                      >
                        <CardForm
                          amount={amountFor('card')}
                          maxInstallments={engine.maxInstallments}
                          limitedByMin={engine.installmentsLimitedByMin}
                          installments={installmentCount}
                          onInstallmentsChange={setInstallmentsChoice}
                        />
                        <Collapse open={engine.pixNudge && !methods.includes('pix')}>
                          <div className="mt-4 flex flex-col gap-3 rounded-lg border border-success/30 bg-success/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-start gap-3">
                              <TrendingDown className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
                              <div>
                                <p className="text-sm font-semibold text-success">
                                  {s.payment.pixNudge(brl(totals.pixSavings))}
                                </p>
                                <p className="text-xs text-muted-foreground">{s.payment.pixNudgeSub}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={nudgeToPix}
                              className="shrink-0 rounded-md bg-success px-3 py-2 text-sm font-medium text-success-foreground transition-opacity hover:opacity-90"
                            >
                              {engine.mixAvailable && methods.length < MAX_MIXED_METHODS ? s.payment.combinePix : s.payment.switchPix}
                            </button>
                          </div>
                        </Collapse>
                      </PaymentOption>
                    )

                  return (
                    <PaymentOption
                      key="koin"
                      id="koin"
                      icon={Wallet}
                      title="Koin"
                      description={s.payment.koinDesc}
                      badge="BNPL"
                      {...common}
                    >
                      <KoinPlan amount={amountFor('koin')} />
                    </PaymentOption>
                  )
                })}
              </div>

              <Collapse open={isSplit}>
                <SplitSlider split={split} onSplitChange={setSplit} amounts={totals.amounts} />
              </Collapse>

              <Collapse open={engine.warrantyUpsell}>
                <div className="flex items-center justify-between gap-3 rounded-xl border bg-background p-4">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold">{s.payment.warranty(brl(WARRANTY_PRICE))}</p>
                      <p className="text-xs text-muted-foreground">{s.payment.warrantySub}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWarranty((w) => !w)}
                    aria-pressed={warranty}
                    className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      warranty ? 'bg-foreground text-background' : 'border bg-background text-foreground hover:bg-muted'
                    }`}
                  >
                    {warranty ? <Check className="size-4" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
                    {warranty ? s.payment.added : '1-click'}
                  </button>
                </div>
              </Collapse>

              <Collapse open={toggles.socialShare}>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-background p-4">
                  <input
                    type="checkbox"
                    checked={wantsSocialShare}
                    onChange={(e) => setWantsSocialShare(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 rounded border-input accent-success"
                  />
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success/10">
                    <Users className="size-4 text-success" aria-hidden="true" />
                  </div>
                  <div className="flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{s.payment.shareTitle}</p>
                      <ExtensionBadge label="social-share" />
                    </div>
                    <p className="text-sm text-muted-foreground text-pretty">
                      {s.payment.shareSub(brl(totals.orderTotal / 2))}
                    </p>
                  </div>
                </label>
              </Collapse>
            </section>
          </div>

          <OrderSummary
            totals={totals}
            warranty={warranty}
            isSplit={isSplit}
            installments={methods.length === 1 && methods[0] === 'card' ? installmentCount : 1}
            thresholdNudge={engine.thresholdNudge}
            isPickup={shipping === 'pickup'}
            canConfirm={methods.length > 0 && cartItems.length > 0}
            onConfirm={confirmOrder}
            cartItems={cartItems}
            savedItems={savedItems}
            saveForLaterEnabled={toggles.saveForLater}
            onSaveForLater={saveForLater}
            onMoveBackToCart={moveBackToCart}
            vtexAdsEnabled={toggles.vtexAds}
            onAddUpsell={addUpsellItem}
            couponsEnabled={toggles.coupons}
            couponInput={couponInput}
            onCouponInputChange={setCouponInput}
            onApplyCoupon={applyCoupon}
            onRemoveCoupon={removeCoupon}
            appliedCoupon={appliedCoupon}
            couponInvalid={couponInvalid}
          />
        </main>
      )}
    </div>
    </LangContext.Provider>
  )
}

function isMethodLocked(method: PaymentMethod, methods: PaymentMethod[], multi: boolean) {
  return multi && methods.length >= MAX_MIXED_METHODS && !methods.includes(method)
}

const SOURCE_STYLE: Record<DecisionSource, string> = {
  engine: 'border-emerald-400/40 text-emerald-300',
  merchant: 'border-sky-400/40 text-sky-300',
  buyer: 'border-amber-400/40 text-amber-300',
}

function PanelLayer({ step, title, subtitle, children }: { step: number; title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div>
        <p className="flex items-center gap-2 text-xs font-semibold text-zinc-100">
          <span className="flex size-5 items-center justify-center rounded-full bg-white/10 font-mono text-[10px]">{step}</span>
          {title}
        </p>
        <p className="mt-0.5 pl-7 text-[11px] text-zinc-500">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

function PanelGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">{label}</legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  )
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: typeof Share2 }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <>
      {options.map((opt) => {
        const Icon = opt.icon
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
            className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              value === opt.value
                ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
                : 'border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {Icon && <Icon className="size-3.5" aria-hidden="true" />}
            {opt.label}
          </button>
        )
      })}
    </>
  )
}

function DebugPanel({
  lang,
  onLangChange,
  profile,
  onProfileChange,
  device,
  onDeviceChange,
  cartValue,
  maxInstallments,
  enabledMethods,
  onMethodEnabled,
  toggles,
  onToggle,
  decisions,
}: {
  lang: Lang
  onLangChange: (l: Lang) => void
  profile: BuyerProfile
  onProfileChange: (p: BuyerProfile) => void
  device: Device
  onDeviceChange: (d: Device) => void
  cartValue: number
  maxInstallments: number
  enabledMethods: EnabledMethods
  onMethodEnabled: (m: PaymentMethod, v: boolean) => void
  toggles: Toggles
  onToggle: (key: keyof Toggles, value: boolean) => void
  decisions: Decision[]
}) {
  const { s, brl } = useI18n()
  const [showLog, setShowLog] = useState(true)
  const enabledCount = Object.values(enabledMethods).filter(Boolean).length
  const p = s.panel

  return (
    <section aria-label={p.ariaLabel} className="border-b border-white/10 bg-zinc-950 text-zinc-300">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs">
            <Terminal className="size-4 text-emerald-400" aria-hidden="true" />
            <span className="font-semibold uppercase tracking-wider text-zinc-100">Debug Mode</span>
            <span className="text-zinc-500">{p.tagline}</span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div role="group" aria-label={p.language} className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 p-0.5">
              <Globe className="ml-1 size-3.5 text-zinc-500" aria-hidden="true" />
              {(['pt', 'en'] as Lang[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onLangChange(option)}
                  aria-pressed={lang === option}
                  className={`rounded px-2 py-0.5 font-mono text-[11px] font-semibold uppercase transition-colors ${
                    lang === option ? 'bg-emerald-400/15 text-emerald-300' : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowLog((v) => !v)}
              aria-expanded={showLog}
              className="flex items-center gap-1 font-mono text-xs text-zinc-400 hover:text-zinc-100"
            >
              <Bot className="size-3.5" aria-hidden="true" /> {p.decisionsButton}
              <ChevronDown className={`size-3.5 transition-transform ${showLog ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_1.35fr]">
          <PanelLayer step={1} title={p.layer1Title} subtitle={p.layer1Subtitle}>
            <PanelGroup label={p.historyGroup}>
              <Segmented
                options={PROFILES.map((value) => ({ value, label: s.profiles[value] }))}
                value={profile}
                onChange={onProfileChange}
              />
              <span className="w-full font-mono text-[11px] text-zinc-400">
                <span className="text-zinc-600">clientProfileData ·</span> {s.history[profile]}
              </span>
            </PanelGroup>
            <PanelGroup label={p.deviceGroup}>
              <Segmented
                options={[
                  { value: 'mobile', label: 'Mobile', icon: Smartphone },
                  { value: 'desktop', label: 'Desktop', icon: Monitor },
                ]}
                value={device}
                onChange={onDeviceChange}
              />
            </PanelGroup>
            <PanelGroup label={p.cartGroup}>
              <span className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-zinc-200 tabular-nums">
                {p.cartChip(brl(cartValue), maxInstallments)}
              </span>
            </PanelGroup>
          </PanelLayer>

          <PanelLayer step={2} title={p.layer2Title} subtitle={p.layer2Subtitle}>
            <PanelGroup label="payment.methods">
              <DebugToggle
                label={p.toggles.pix}
                icon={QrCode}
                checked={enabledMethods.pix}
                disabled={enabledMethods.pix && enabledCount === 1}
                onChange={(v) => onMethodEnabled('pix', v)}
              />
              <DebugToggle
                label={p.toggles.card}
                icon={CreditCard}
                checked={enabledMethods.card}
                disabled={enabledMethods.card && enabledCount === 1}
                onChange={(v) => onMethodEnabled('card', v)}
              />
              <DebugToggle
                label={p.toggles.koin}
                icon={Wallet}
                checked={enabledMethods.koin}
                disabled={enabledMethods.koin && enabledCount === 1}
                onChange={(v) => onMethodEnabled('koin', v)}
              />
            </PanelGroup>
            <PanelGroup label="payment.modules">
              <DebugToggle
                label={p.toggles.paymentMix}
                icon={SlidersHorizontal}
                checked={toggles.paymentMix}
                onChange={(v) => onToggle('paymentMix', v)}
              />
              <DebugToggle label={p.toggles.coupons} icon={Tag} checked={toggles.coupons} onChange={(v) => onToggle('coupons', v)} />
              <DebugToggle
                label={p.toggles.socialShare}
                icon={Share2}
                checked={toggles.socialShare}
                onChange={(v) => onToggle('socialShare', v)}
              />
            </PanelGroup>
            <PanelGroup label="extra.apps">
              <DebugToggle label={p.toggles.vtexAds} icon={Megaphone} checked={toggles.vtexAds} onChange={(v) => onToggle('vtexAds', v)} />
              <DebugToggle
                label={p.toggles.saveForLater}
                icon={Heart}
                checked={toggles.saveForLater}
                onChange={(v) => onToggle('saveForLater', v)}
              />
              <DebugToggle
                label={p.toggles.pickup}
                icon={Store}
                checked={toggles.pickup}
                onChange={(v) => onToggle('pickup', v)}
              />
            </PanelGroup>
          </PanelLayer>
        </div>

        <Collapse open={showLog}>
          <div className="rounded-lg border border-white/10 bg-black/40 p-4">
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-zinc-100">
              <span className="flex size-5 items-center justify-center rounded-full bg-white/10 font-mono text-[10px]">3</span>
              {p.layer3Title}
              <span className="font-normal text-zinc-500">{p.layer3Subtitle}</span>
            </p>
            <ul className="flex max-h-80 flex-col gap-2.5 overflow-y-auto font-mono text-[11px]" aria-live="polite">
              {decisions.map((d) => (
                <li
                  key={`${d.source}-${d.signal}-${d.action}`}
                  className="flex gap-2 animate-in fade-in slide-in-from-left-1 duration-300"
                >
                  <span
                    className={`mt-px h-fit shrink-0 rounded border px-1.5 text-[9px] uppercase tracking-wider ${SOURCE_STYLE[d.source]}`}
                  >
                    {p.source[d.source]}
                  </span>
                  <div className="min-w-0">
                    <p className="text-zinc-300">
                      <span className="text-zinc-500">{d.signal}</span> <span className="text-zinc-600">→</span> {d.action}
                    </p>
                    {(d.hypothesis || d.kpi) && (
                      <p className="mt-0.5 font-sans text-[11px] text-zinc-500">
                        {d.hypothesis}
                        {d.kpi && (
                          <>
                            {' · '}
                            <span className="text-zinc-400">KPI:</span> {d.kpi}
                          </>
                        )}
                        {d.guardrail && (
                          <>
                            {' · '}
                            <span className="text-zinc-400">guardrail:</span> {d.guardrail}
                          </>
                        )}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Collapse>
      </div>
    </section>
  )
}

function DebugToggle({
  label,
  icon: Icon,
  checked,
  disabled,
  onChange,
}: {
  label: string
  icon: typeof Share2
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  const { s } = useI18n()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      title={disabled ? s.panel.lastMethod : undefined}
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-100'
      }`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
      <span
        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-emerald-400' : 'bg-zinc-700'
        }`}
        aria-hidden="true"
      >
        <span
          className={`size-3 rounded-full bg-zinc-950 transition-transform ${checked ? 'translate-x-3.5' : 'translate-x-0.5'}`}
        />
      </span>
    </button>
  )
}

// Marca, imagem e preço do anúncio por segmento; título e descrição vêm do i18n.
const AD_BY_PROFILE: Record<BuyerProfile, { brand: string; image: string; price: number }> = {
  new: { brand: 'StepGuard', image: '/products/spray.png', price: 24.9 * 0.8 },
  pix: { brand: 'ConfortMax', image: '/products/palmilha.png', price: 29.9 },
  card: { brand: 'RunLace', image: '/products/cadarco.png', price: 19.9 },
}

function VtexAdsBanner({ profile }: { profile: BuyerProfile }) {
  const { s, brl } = useI18n()
  const ad = { ...AD_BY_PROFILE[profile], ...s.ads[profile] }
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4">
      <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border bg-background">
        <Image src={ad.image || '/placeholder.svg'} alt={ad.title} fill sizes="56px" className="object-cover" />
      </div>
      <div className="flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary">{ad.brand}</span>
          <ExtensionBadge label="vtex-ads" />
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {s.ads.sponsored}
          </span>
        </div>
        <p className="text-sm font-semibold">
          {ad.title} <span className="font-normal text-muted-foreground">· {brl(ad.price)}</span>
        </p>
        <p className="text-sm text-muted-foreground text-pretty">{ad.description}</p>
      </div>
    </div>
  )
}

const inputClass =
  'w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-shadow placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/40'

function DeliverySection({
  isNewUser,
  shipping,
  onShippingChange,
  pickupAvailable,
  pickupRecommended,
}: {
  isNewUser: boolean
  shipping: ShippingOption
  onShippingChange: (s: ShippingOption) => void
  pickupAvailable: boolean
  pickupRecommended: boolean
}) {
  const shippingOptions: ShippingOption[] = pickupAvailable
    ? pickupRecommended
      ? ['pickup', 'standard', 'express']
      : ['standard', 'express', 'pickup']
    : ['standard', 'express']
  const { s, brl } = useI18n()
  const d = s.delivery

  return (
    <section aria-labelledby="delivery-title" className="flex flex-col gap-4">
      <div>
        <h1 id="delivery-title" className="text-2xl font-semibold tracking-tight">
          {d.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isNewUser ? d.subtitleNew : d.subtitle}
        </p>
      </div>

      <div className="flex flex-col gap-5 rounded-xl border bg-background p-5">
        {isNewUser ? (
          <div className="grid gap-3 animate-in fade-in slide-in-from-top-1 duration-300 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs font-medium sm:col-span-2">
              {d.fullName}
              <input className={inputClass} name="name" autoComplete="name" placeholder={d.fullNamePlaceholder} />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium">
              {d.cpf}
              <input className={inputClass} name="cpf" inputMode="numeric" maxLength={14} placeholder="000.000.000-00" />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium">
              {d.phone}
              <input className={inputClass} name="phone" type="tel" autoComplete="tel" placeholder="(11) 90000-0000" />
            </label>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/40 p-4 animate-in fade-in duration-300">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-medium">{d.home}</p>
                <p className="text-muted-foreground">{d.address}</p>
              </div>
            </div>
            <button type="button" className="shrink-0 text-xs font-medium text-primary hover:underline">
              {d.change}
            </button>
          </div>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-xs font-medium">{d.method}</legend>
          {isNewUser ? (
            <label className="flex cursor-not-allowed items-center gap-4 rounded-lg border-2 border-success bg-success/10 p-4 animate-in fade-in zoom-in-95 duration-300">
              <input type="radio" name="shipping" checked disabled readOnly className="size-4 accent-[var(--success)]" />
              <Truck className="size-5 shrink-0 text-success" aria-hidden="true" />
              <span className="flex-1">
                <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {d.expressFree}
                  <span className="inline-flex items-center gap-1 rounded bg-success px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success-foreground">
                    <Gift className="size-3" aria-hidden="true" /> {d.benefit}
                  </span>
                </span>
                <span className="block text-xs text-muted-foreground">
                  {d.welcome}
                </span>
              </span>
              <span className="flex flex-col items-end">
                <span className="text-xs text-muted-foreground line-through tabular-nums">{brl(SHIPPING_PRICE.express)}</span>
                <Lock className="size-4 text-success" aria-label={d.locked} />
              </span>
            </label>
          ) : (
            shippingOptions.map((key) => {
              const option = { ...s.shipping[key], price: SHIPPING_PRICE[key] }
              const active = shipping === key
              const isPickup = key === 'pickup'
              const Icon = isPickup ? Store : Truck
              return (
                <label
                  key={key}
                  className={`flex cursor-pointer items-center gap-4 rounded-lg border p-4 transition-colors animate-in fade-in duration-300 ${
                    active ? 'border-primary bg-primary/[0.03]' : 'hover:bg-muted/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="shipping"
                    value={key}
                    checked={active}
                    onChange={() => onShippingChange(key)}
                    className="size-4 accent-[var(--primary)]"
                  />
                  <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {option.label}
                      {isPickup && <ExtensionBadge label="pickup" />}
                      {isPickup && pickupRecommended && (
                        <span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
                          {d.recommended(brl(SHIPPING_PRICE.standard))}
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-muted-foreground">{option.eta}</span>
                  </span>
                  <span className={`text-sm font-medium tabular-nums ${isPickup ? 'text-success' : ''}`}>
                    {option.price === 0 ? d.free : brl(option.price)}
                  </span>
                </label>
              )
            })
          )}
        </fieldset>
      </div>
    </section>
  )
}

function PaymentOption({
  id,
  icon: Icon,
  title,
  description,
  badge,
  multi,
  selected,
  disabled,
  onSelect,
  last,
  children,
}: {
  id: PaymentMethod
  icon: typeof CreditCard
  title: string
  description: string
  badge?: string
  multi: boolean
  selected: boolean
  disabled: boolean
  onSelect: () => void
  last?: boolean
  children: ReactNode
}) {
  const { s } = useI18n()
  return (
    <div className={`transition-colors ${last ? '' : 'border-b'} ${selected ? 'bg-primary/[0.02]' : ''}`}>
      <button
        type="button"
        role={multi ? 'checkbox' : 'radio'}
        aria-checked={selected}
        aria-controls={`payment-${id}`}
        disabled={disabled}
        onClick={onSelect}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
      >
        {multi ? (
          <span
            className={`flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
              selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
            }`}
            aria-hidden="true"
          >
            <Check className={`size-3.5 transition-transform ${selected ? 'scale-100' : 'scale-0'}`} strokeWidth={3} />
          </span>
        ) : (
          <span
            className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
              selected ? 'border-primary' : 'border-muted-foreground/40'
            }`}
            aria-hidden="true"
          >
            <span className={`size-2.5 rounded-full bg-primary transition-transform ${selected ? 'scale-100' : 'scale-0'}`} />
          </span>
        )}
        <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1">
          <span className="flex items-center gap-2 font-medium">
            {title}
            {badge && <span className="rounded bg-success/10 px-1.5 py-0.5 text-[11px] font-semibold text-success">{badge}</span>}
          </span>
          <span className="block text-xs text-muted-foreground">{disabled ? s.payment.maxReached(MAX_MIXED_METHODS) : description}</span>
        </span>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform duration-300 ${selected ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      <Collapse open={selected}>
        <div id={`payment-${id}`} className="px-5 pb-5 pl-14">
          {children}
        </div>
      </Collapse>
    </div>
  )
}

function CardForm({
  amount,
  maxInstallments,
  limitedByMin,
  installments,
  onInstallmentsChange,
}: {
  amount: number
  maxInstallments: number
  limitedByMin: boolean
  installments: number
  onInstallmentsChange: (v: number) => void
}) {
  const { s, brl } = useI18n()
  const c = s.cardForm
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="col-span-2 flex flex-col gap-1.5 text-xs font-medium">
        {c.number}
        <input className={inputClass} inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" />
      </label>
      <label className="col-span-2 flex flex-col gap-1.5 text-xs font-medium">
        {c.name}
        <input className={inputClass} autoComplete="cc-name" placeholder={c.namePlaceholder} />
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-medium">
        {c.expiry}
        <input className={inputClass} autoComplete="cc-exp" placeholder={c.expiryPlaceholder} />
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-medium">
        {c.cvv}
        <input className={inputClass} inputMode="numeric" autoComplete="cc-csc" placeholder="123" />
      </label>
      <label className="col-span-2 flex flex-col gap-1.5 text-xs font-medium">
        {c.installments}
        <select
          className={inputClass}
          value={installments}
          onChange={(e) => onInstallmentsChange(Number(e.target.value))}
        >
          {Array.from({ length: maxInstallments }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n === 1 ? c.optionFull(brl(amount)) : c.option(n, brl(amount / n))}
            </option>
          ))}
        </select>
        {limitedByMin && (
          <span className="font-normal text-muted-foreground">
            {c.minNote(brl(MIN_INSTALLMENT_VALUE))}
          </span>
        )}
      </label>
    </div>
  )
}

function KoinPlan({ amount }: { amount: number }) {
  const { s, brl } = useI18n()
  const labels = s.koin.labels
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        <span className="font-medium">{s.koin.head(brl(amount / 4))}</span>{' '}
        <span className="text-muted-foreground">{s.koin.sub}</span>
      </p>
      <ol className="grid grid-cols-4 gap-2">
        {labels.map((label, i) => (
          <li key={label} className="flex flex-col gap-1.5">
            <span className={`h-1.5 rounded-full ${i === 0 ? 'bg-primary' : 'bg-primary/20'}`} />
            <span className="text-[11px] text-muted-foreground">{label}</span>
            <span className="text-xs font-medium tabular-nums">{brl(amount / 4)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function SplitSlider({
  split,
  onSplitChange,
  amounts,
}: {
  split: number
  onSplitChange: (value: number) => void
  amounts: { method: PaymentMethod; percent: number; amount: number }[]
}) {
  const { s, brl } = useI18n()
  if (amounts.length < 2) return null
  const [first, second] = amounts
  const name = s.method
  return (
    <div className="rounded-xl border bg-background p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal className="size-4 text-primary" aria-hidden="true" />
          {s.split.title}
        </p>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {first.percent}% / {second.percent}%
        </span>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-3">
        {[first, second].map((entry, i) => (
          <div key={entry.method} className={`rounded-lg border p-3 ${i === 1 ? 'text-right' : ''}`}>
            <p className="text-xs text-muted-foreground">{name[entry.method]}</p>
            <p className="text-lg font-semibold tabular-nums">{brl(entry.amount)}</p>
          </div>
        ))}
      </div>
      <label className="flex flex-col gap-2">
        <span className="sr-only">
          {s.split.srLabel(name[first.method])}
        </span>
        <input
          type="range"
          min={10}
          max={90}
          step={5}
          value={split}
          onChange={(e) => onSplitChange(Number(e.target.value))}
          aria-valuetext={`${first.percent}% ${name[first.method]}, ${second.percent}% ${name[second.method]}`}
          className="h-2 w-full cursor-pointer accent-[var(--primary)]"
        />
        <span className="flex justify-between text-[11px] text-muted-foreground">
          <span>{s.split.more(name[second.method])}</span>
          <span>{s.split.more(name[first.method])}</span>
        </span>
      </label>
    </div>
  )
}

function OrderSummary({
  totals,
  warranty,
  isSplit,
  installments,
  thresholdNudge,
  isPickup,
  canConfirm,
  onConfirm,
  cartItems,
  savedItems,
  saveForLaterEnabled,
  onSaveForLater,
  onMoveBackToCart,
  vtexAdsEnabled,
  onAddUpsell,
  couponsEnabled,
  couponInput,
  onCouponInputChange,
  onApplyCoupon,
  onRemoveCoupon,
  appliedCoupon,
  couponInvalid,
}: {
  totals: {
    subtotal: number
    shippingValue: number
    discount: number
    couponDiscount: number
    orderTotal: number
    customerShare: number
    friendAmount: number
    total: number
    amounts: { method: PaymentMethod; percent: number; amount: number }[]
  }
  warranty: boolean
  isSplit: boolean
  installments: number
  thresholdNudge: { missing: number; max: number } | null
  isPickup: boolean
  canConfirm: boolean
  onConfirm: () => void
  cartItems: CartItem[]
  savedItems: CartItem[]
  saveForLaterEnabled: boolean
  onSaveForLater: (id: string) => void
  onMoveBackToCart: (id: string) => void
  vtexAdsEnabled: boolean
  onAddUpsell: (product: CartItem) => void
  couponsEnabled: boolean
  couponInput: string
  onCouponInputChange: (value: string) => void
  onApplyCoupon: () => void
  onRemoveCoupon: () => void
  appliedCoupon: Coupon | null
  couponInvalid: boolean
}) {
  const { s, brl } = useI18n()
  const m = s.summary
  const product = (id: string) => s.products[id]
  return (
    <aside aria-labelledby="summary-title" className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
      <div className="rounded-xl border bg-background">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 id="summary-title" className="font-semibold">
            {m.title}
          </h2>
          <span className="text-sm text-muted-foreground">{m.items(cartItems.length)}</span>
        </div>

        <ul className="px-5">
          {cartItems.map((item) => (
            <li key={item.id} className="flex gap-3 border-b py-4 last:border-b-0">
              <div className="relative size-16 shrink-0 overflow-hidden rounded-md border bg-muted">
                <Image src={item.image || '/placeholder.svg'} alt={product(item.id).name} fill sizes="64px" className="object-cover" />
              </div>
              <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-medium">{product(item.id).name}</p>
                    {item.upsell && <ExtensionBadge label="vtex-ads" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{product(item.id).variant}</p>
                  {saveForLaterEnabled && (
                    <button
                      type="button"
                      onClick={() => onSaveForLater(item.id)}
                      className="mt-1 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <Heart className="size-3" aria-hidden="true" />
                      {m.saveForLater}
                    </button>
                  )}
                </div>
                <p className="shrink-0 text-sm font-medium tabular-nums">{brl(item.price)}</p>
              </div>
            </li>
          ))}
        </ul>

        {vtexAdsEnabled && (() => {
          const remaining = UPSELL_PRODUCTS.filter((p) => !cartItems.some((i) => i.id === p.id))
          const unlocked = !isPickup && totals.shippingValue === 0 && cartItems.some((i) => i.upsell)
          const headline = isPickup ? m.adsPickup : unlocked ? m.adsUnlocked : m.adsHeadline
          if (!remaining.length && !unlocked) return null
          return (
            <div className="border-t bg-primary/5 px-5 py-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <ExtensionBadge label="vtex-ads" />
                <span className={`text-xs font-medium ${unlocked ? 'text-success' : 'text-muted-foreground'}`}>{headline}</span>
              </div>
              {remaining.length > 0 && (
                <ul className="flex flex-col gap-3">
                  {remaining.map((product) => (
                    <li key={product.id} className="flex items-center gap-3">
                      <div className="relative size-12 shrink-0 overflow-hidden rounded-md border bg-muted">
                        <Image src={product.image || '/placeholder.svg'} alt={s.products[product.id].name} fill sizes="48px" className="object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{s.products[product.id].name}</p>
                        <p className="text-xs text-muted-foreground">{brl(product.price)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onAddUpsell(product)}
                        className="flex shrink-0 items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted"
                      >
                        <Plus className="size-3" aria-hidden="true" />
                        {m.add}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })()}

        {saveForLaterEnabled && savedItems.length > 0 && (
          <div className="border-t bg-muted/40 px-5 py-4">
            <div className="mb-2 flex items-center gap-2">
              <ExtensionBadge label="save-for-later" />
              <span className="text-xs font-medium text-muted-foreground">{m.saved(savedItems.length)}</span>
            </div>
            <ul className="flex flex-col gap-3">
              {savedItems.map((item) => (
                <li key={item.id} className="flex items-center gap-3 opacity-80">
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-md border bg-muted">
                    <Image src={item.image || '/placeholder.svg'} alt={product(item.id).name} fill sizes="48px" className="object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{product(item.id).name}</p>
                    <p className="text-xs text-muted-foreground">{brl(item.price)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onMoveBackToCart(item.id)}
                    className="shrink-0 rounded-md border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted"
                  >
                    {m.moveToCart}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {couponsEnabled && (
          <div className="border-t px-5 py-4">
            <div className="mb-2 flex items-center gap-2">
              <ExtensionBadge label="coupons" />
              <span className="text-xs font-medium text-muted-foreground">{m.couponTitle}</span>
            </div>
            {appliedCoupon ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/5 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Tag className="size-4 shrink-0 text-success" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-success">{appliedCoupon.code}</p>
                    <p className="text-xs text-muted-foreground">{s.coupons[appliedCoupon.code]}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onRemoveCoupon}
                  className="shrink-0 rounded-md border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted"
                >
                  {m.remove}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => onCouponInputChange(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        onApplyCoupon()
                      }
                    }}
                    placeholder={m.couponPlaceholder}
                    className={`${inputClass} uppercase`}
                  />
                  <button
                    type="button"
                    onClick={onApplyCoupon}
                    disabled={!couponInput.trim()}
                    className="shrink-0 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {m.apply}
                  </button>
                </div>
                {couponInvalid && <p className="text-xs font-medium text-destructive">{m.couponInvalid}</p>}
                <p className="text-[11px] text-muted-foreground">{m.couponHint}</p>
              </div>
            )}
          </div>
        )}

        <dl className="flex flex-col border-t px-5 py-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{m.subtotal}</dt>
            <dd className="tabular-nums">{brl(totals.subtotal)}</dd>
          </div>
          <Collapse innerClassName="pt-2" open={warranty}>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{m.warranty}</dt>
              <dd className="tabular-nums">{brl(WARRANTY_PRICE)}</dd>
            </div>
          </Collapse>
          <div className="flex justify-between pt-2">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <Truck className="size-4" aria-hidden="true" /> {m.shipping}
            </dt>
            <dd className={`tabular-nums ${totals.shippingValue === 0 ? 'font-medium text-success' : ''}`}>
              {totals.shippingValue === 0 ? m.free : brl(totals.shippingValue)}
            </dd>
          </div>
          <Collapse innerClassName="pt-2" open={totals.discount - totals.couponDiscount > 0}>
            <div className="flex justify-between text-success">
              <dt>{m.pixDiscount}</dt>
              <dd className="tabular-nums">- {brl(totals.discount - totals.couponDiscount)}</dd>
            </div>
          </Collapse>
          <Collapse innerClassName="pt-2" open={totals.couponDiscount > 0}>
            <div className="flex justify-between text-success">
              <dt className="flex items-center gap-1.5">
                <Tag className="size-3.5" aria-hidden="true" />
                {m.coupon(appliedCoupon?.code ?? '')}
              </dt>
              <dd className="tabular-nums">- {brl(totals.couponDiscount)}</dd>
            </div>
          </Collapse>
          <Collapse innerClassName="pt-2" open={totals.customerShare < 1}>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-success/5 px-3 py-2 text-success">
              <dt className="flex items-center gap-1.5 font-medium">
                <Users className="size-3.5" aria-hidden="true" />
                {m.splitWithFriend}
              </dt>
              <dd className="text-xs text-muted-foreground">{m.orderValue(brl(totals.orderTotal))}</dd>
            </div>
          </Collapse>
          <div className="mt-2 flex items-baseline justify-between border-t pt-3">
            <dt className="font-semibold">{totals.customerShare < 1 ? m.payNow : m.total}</dt>
            <dd className="text-xl font-semibold tabular-nums" aria-live="polite">
              {brl(totals.total)}
            </dd>
          </div>
          <Collapse innerClassName="pt-2" open={totals.customerShare < 1}>
            <p className="text-right text-xs text-muted-foreground">
              {m.friendPays(brl(totals.friendAmount))}
            </p>
          </Collapse>
          {installments > 1 && (
            <p className="pt-2 text-right text-xs text-muted-foreground">
              {m.installmentLine(installments, brl(totals.total / installments))}
            </p>
          )}
          <Collapse innerClassName="pt-2" open={!!thresholdNudge}>
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
              <CreditCard className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span>
                {m.thresholdBefore} <strong className="tabular-nums">{brl(thresholdNudge?.missing ?? 0)}</strong>{' '}
                {m.thresholdMiddle} <strong>{m.thresholdMax(thresholdNudge?.max ?? 0)}</strong>
              </span>
            </div>
          </Collapse>
          <Collapse innerClassName="pt-2" open={isSplit}>
            <ul className="flex flex-col gap-1 rounded-lg bg-muted/60 p-3 text-xs">
              {totals.amounts.map((a) => (
                <li key={a.method} className="flex justify-between">
                  <span className="text-muted-foreground">
                    {s.method[a.method]} · {a.percent}%
                  </span>
                  <span className="font-medium tabular-nums">{brl(a.amount)}</span>
                </li>
              ))}
            </ul>
          </Collapse>
        </dl>

        <div className="px-5 pb-5">
          <button
            type="button"
            disabled={!canConfirm}
            onClick={onConfirm}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ShieldCheck className="size-4" aria-hidden="true" />
            {canConfirm ? m.confirm : m.selectPayment}
          </button>
        </div>
      </div>
    </aside>
  )
}

function SuccessPage({
  amounts,
  total,
  friendAmount,
  installments,
  socialShare,
  shippingLabel,
  pixMode,
  onBack,
}: {
  amounts: { method: PaymentMethod; percent: number; amount: number }[]
  total: number
  friendAmount: number
  installments: number
  socialShare: boolean
  shippingLabel: string
  pixMode: 'qr' | 'copy'
  onBack: () => void
}) {
  const { s, brl } = useI18n()
  const t = s.success
  const pix = amounts.find((a) => a.method === 'pix')
  const shareText = encodeURIComponent(t.shareMessage(ORDER_ID, brl(friendAmount)))

  const methodDetail = (a: (typeof amounts)[number]) => {
    if (a.method === 'card') return installments > 1 ? t.installments(installments, brl(a.amount / installments)) : t.full
    if (a.method === 'koin') return t.installments(4, brl(a.amount / 4))
    return t.waiting
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-8 md:py-12 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-success/10">
          <CircleCheckBig className="size-7 text-success" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {socialShare ? t.titleShare : t.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.order} <span className="font-mono font-medium text-foreground">#{ORDER_ID}</span> · {shippingLabel}
          </p>
        </div>
      </div>

      {pix && (
        <section aria-labelledby="pix-title" className="flex flex-col items-center gap-4 rounded-xl border bg-background p-6 text-center">
          <div>
            <h2 id="pix-title" className="font-semibold">
              {t.payPix(brl(pix.amount))}
            </h2>
            <p className="text-sm text-muted-foreground">
              {pixMode === 'copy' ? t.hintCopy : t.hintQr}
            </p>
          </div>
          {pixMode === 'qr' && (
            <div className="rounded-xl border bg-white p-3">
              <QrMock />
            </div>
          )}
          <PixCountdown />
          <CopyPixButton primary={pixMode === 'copy'} />
        </section>
      )}

      {socialShare && (
        <section aria-labelledby="share-title" className="flex flex-col gap-4 rounded-xl border border-success/30 bg-success/5 p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success/10">
              <Users className="size-5 text-success" aria-hidden="true" />
            </div>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h2 id="share-title" className="font-semibold">
                  {t.shareTitle}
                </h2>
                <ExtensionBadge label="social-share" />
              </div>
              <p className="text-sm text-muted-foreground text-pretty">
                {t.shareBody(brl(friendAmount))}
              </p>
            </div>
          </div>
          <a
            href={`https://wa.me/?text=${shareText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg bg-success px-4 py-3 text-center text-sm font-semibold text-success-foreground transition-opacity hover:opacity-90"
          >
            <WhatsAppIcon className="size-4 shrink-0" />
            {t.shareCta}
          </a>
        </section>
      )}

      <section aria-labelledby="payment-summary-title" className="rounded-xl border bg-background">
        <h2 id="payment-summary-title" className="border-b px-5 py-3 text-sm font-semibold">
          {t.paymentSummary}
        </h2>
        <ul className="flex flex-col px-5">
          {amounts.map((a) => (
            <li key={a.method} className="flex items-center justify-between gap-3 border-b py-3 text-sm last:border-b-0">
              <div>
                <p className="font-medium">
                  {s.method[a.method]}
                  {amounts.length > 1 && <span className="ml-1.5 text-xs text-muted-foreground">{a.percent}%</span>}
                </p>
                <p className="text-xs text-muted-foreground">{methodDetail(a)}</p>
              </div>
              <span className="font-medium tabular-nums">{brl(a.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t px-5 py-3 text-sm">
          <span className="font-semibold">{t.total}</span>
          <span className="font-semibold tabular-nums">{brl(total)}</span>
        </div>
      </section>

      <button
        type="button"
        onClick={onBack}
        className="flex items-center justify-center gap-2 rounded-lg border bg-background px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
      >
        <RotateCcw className="size-4" aria-hidden="true" />
        {t.back}
      </button>
    </main>
  )
}

function PixCountdown() {
  const { s } = useI18n()
  const [secondsLeft, setSecondsLeft] = useState(PIX_TIMER_SECONDS)

  useEffect(() => {
    const id = window.setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000)
    return () => window.clearInterval(id)
  }, [])

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')
  const expired = secondsLeft === 0

  return (
    <p
      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${
        expired ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground'
      }`}
      role="timer"
      aria-live="off"
    >
      <Timer className="size-4" aria-hidden="true" />
      {expired ? s.success.expired : s.success.expiresIn}
      <span className="font-mono tabular-nums">
        {mm}:{ss}
      </span>
    </p>
  )
}

function CopyPixButton({ primary = false }: { primary?: boolean }) {
  const { s } = useI18n()
  const [copied, setCopied] = useState(false)
  const code = `00020126580014BR.GOV.BCB.PIX0136allmart-${ORDER_ID}5204000053039865802BR6009SAO PAULO`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
    } finally {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={
        primary
          ? 'flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90'
          : 'flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted'
      }
    >
      {copied ? <Check className="size-4 text-success" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
      {copied ? s.success.copied : s.success.copy}
    </button>
  )
}

const QR_SIZE = 25

function isFinderCell(r: number, c: number) {
  const origins = [
    [0, 0],
    [0, QR_SIZE - 7],
    [QR_SIZE - 7, 0],
  ]
  for (const [or, oc] of origins) {
    const y = r - or
    const x = c - oc
    if (y >= -1 && y <= 7 && x >= -1 && x <= 7) {
      if (y < 0 || y > 6 || x < 0 || x > 6) return { inZone: true, dark: false }
      const ring = y === 0 || y === 6 || x === 0 || x === 6
      const core = y >= 2 && y <= 4 && x >= 2 && x <= 4
      return { inZone: true, dark: ring || core }
    }
  }
  return { inZone: false, dark: false }
}

function QrMock() {
  const { s } = useI18n()
  const cells = useMemo(() => {
    const dark: [number, number][] = []
    for (let r = 0; r < QR_SIZE; r++) {
      for (let c = 0; c < QR_SIZE; c++) {
        const finder = isFinderCell(r, c)
        const on = finder.inZone ? finder.dark : (r * 7 + c * 13 + ((r * c) % 5)) % 3 === 0
        if (on) dark.push([r, c])
      }
    }
    return dark
  }, [])

  return (
    <svg
      viewBox={`0 0 ${QR_SIZE} ${QR_SIZE}`}
      className="size-44"
      shapeRendering="crispEdges"
      role="img"
      aria-label={s.success.qrLabel}
    >
      {cells.map(([r, c]) => (
        <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#09090b" />
      ))}
    </svg>
  )
}
