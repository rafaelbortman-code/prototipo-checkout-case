'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Image from 'next/image'
import {
  Bot,
  Check,
  ChevronDown,
  CircleCheckBig,
  Copy,
  CreditCard,
  Gift,
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

type CartItem = {
  id: string
  name: string
  variant: string
  price: number
  image: string
  upsell?: boolean
}

const CART: CartItem[] = [
  { id: 'tenis', name: 'Tênis Runner Pro', variant: 'Branco · 42', price: 400, image: '/products/tenis.png' },
  { id: 'meia', name: 'Meia Performance Cano Médio', variant: 'Branco · M', price: 50, image: '/products/meia.png' },
]

const UPSELL_PRODUCTS: CartItem[] = [
  { id: 'cadarco', name: 'Cadarço Extra Resistente', variant: 'Preto · Par avulso', price: 29.9, image: '/products/cadarco.png', upsell: true },
  { id: 'palmilha', name: 'Palmilha Conforto Gel', variant: 'Tamanho único', price: 29.9, image: '/products/palmilha.png', upsell: true },
  { id: 'spray', name: 'Spray Impermeabilizante', variant: '200ml', price: 24.9, image: '/products/spray.png', upsell: true },
]

const PROFILE_OPTIONS: { value: BuyerProfile; label: string }[] = [
  { value: 'new', label: 'Novo Usuário' },
  { value: 'pix', label: 'Cliente (Foco em Pix)' },
  { value: 'card', label: 'Cliente (Foco em Cartão)' },
]

const PREFERRED_METHOD: Record<BuyerProfile, PaymentMethod | null> = {
  new: null,
  pix: 'pix',
  card: 'card',
}

const METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: 'Pix',
  card: 'Cartão',
  koin: 'Koin',
}

const SHIPPING: Record<ShippingOption, { label: string; eta: string; price: number }> = {
  standard: { label: 'Frete Padrão', eta: '5 a 7 dias úteis', price: 14.9 },
  express: { label: 'Frete Expresso', eta: '1 a 2 dias úteis', price: 24.9 },
  pickup: { label: 'Retirar na loja', eta: 'Allmart Paulista · 1,2 km · pronto em 2h', price: 0 },
}

const PIX_DISCOUNT_RATE = 0.05
const WARRANTY_PRICE = 39.9
const MAX_MIXED_METHODS = 2
const PIX_TIMER_SECONDS = 10 * 60
const ORDER_ID = 'AM-240927'

type Coupon = { code: string; label: string; type: 'percent' | 'shipping'; value: number }

const COUPONS: Record<string, Coupon> = {
  BEMVINDO10: { code: 'BEMVINDO10', label: '10% OFF no pedido', type: 'percent', value: 0.1 },
  FRETEGRATIS: { code: 'FRETEGRATIS', label: 'Frete grátis', type: 'shipping', value: 0 },
}

const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/* ------------------------------------------------------------------ */
/* Motor de personalização                                             */
/* Função pura: recebe sinais do comprador + regras do lojista e       */
/* devolve o que o checkout deve mostrar, com o porquê de cada decisão. */
/* Em produção isso seria um serviço (regras → modelo), aqui é local.   */
/* ------------------------------------------------------------------ */

type DecisionSource = 'motor' | 'lojista' | 'comprador'
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
  const decisions: Decision[] = []
  const methodOrder = methodOrderFor(i.profile, i.device, i.enabled)
  const preferred = PREFERRED_METHOD[i.profile]

  // 1. Segmento do comprador
  if (i.profile === 'new') {
    decisions.push({
      source: 'motor',
      signal: 'segment = new_user',
      action: 'mount(signup_lite) + lock(shipping.express = free)',
      hypothesis: 'Tirar fricção e risco percebido da primeira compra',
      kpi: 'conversão de 1ª compra',
      guardrail: 'custo de frete por pedido',
    })
  }
  if (preferred && !i.enabled[preferred]) {
    decisions.push({
      source: 'motor',
      signal: `segment = ${preferred}_affinity · merchant.${preferred} = off`,
      action: methodOrder[0] ? `fallback → expand(${methodOrder[0]})` : 'fallback → nenhum método disponível',
      hypothesis: 'A preferência do comprador nunca sobrepõe o que a loja aceita',
    })
  } else if (i.profile === 'card') {
    decisions.push({
      source: 'motor',
      signal: 'segment = card_affinity',
      action: 'expand(card) + installments.default = máx. sem juros',
      hypothesis: 'Comprador de cartão decide pelo valor da parcela',
      kpi: 'conversão em cartão',
      guardrail: 'custo de parcelamento (MDR)',
    })
  } else if (i.profile === 'pix') {
    decisions.push({
      source: 'motor',
      signal: 'segment = pix_affinity',
      action: 'expand(pix) + inject(upsell_warranty, 1-click)',
      hypothesis: 'Pix custa menos ao lojista → margem para oferecer um attach',
      kpi: 'attach rate de garantia · AOV',
      guardrail: 'conversão',
    })
  }

  const pixNudge = i.profile === 'card' && i.enabled.pix
  if (i.profile === 'card') {
    decisions.push(
      i.enabled.pix
        ? {
            source: 'motor',
            signal: 'segment = card_affinity · merchant.pix = on',
            action: 'inject(pix_nudge: "economize fechando no Pix")',
            hypothesis: 'Migrar parte do volume de cartão para Pix reduz MDR',
            kpi: 'share de Pix',
            guardrail: 'conversão total',
          }
        : {
            source: 'motor',
            signal: 'merchant.pix = off',
            action: 'suppress(pix_nudge) → reforçar parcelamento sem juros',
            hypothesis: 'Sem Pix, a alavanca de conversão passa a ser a parcela',
          },
    )
  }

  // 2. Dispositivo (sinal em tempo real)
  const pixMode = i.device === 'mobile' ? 'copy' : 'qr'
  if (i.enabled.pix) {
    decisions.push({
      source: 'motor',
      signal: `device = ${i.device}`,
      action:
        i.device === 'mobile'
          ? `pix.mode = copia_e_cola${!preferred ? ' + order(pix primeiro)' : ''}`
          : 'pix.mode = qr_code',
      hypothesis:
        i.device === 'mobile'
          ? 'QR Code não é escaneável na mesma tela do celular'
          : 'No desktop, o QR é o caminho mais rápido até o app do banco',
      kpi: 'Pix gerado → Pix pago',
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
      source: 'motor',
      signal: `cart.value = ${brl(i.cartValue)}`,
      action: `card.installments ≤ ${maxInstallments}x sem juros${
        installmentsLimitedByMin ? ` (parcela mín. ${brl(MIN_INSTALLMENT_VALUE)})` : ''
      }`,
      hypothesis: 'Parcelas proporcionais ao ticket: não subsidiar juros em pedido pequeno',
      kpi: 'conversão em cartão',
      guardrail: 'custo de parcelamento / GMV',
    })
    const next = nextTierFor(i.cartValue)
    if (cardRelevant && next && next.from - i.cartValue <= THRESHOLD_NUDGE_WINDOW) {
      thresholdNudge = { missing: next.from - i.cartValue, max: next.max }
      decisions.push({
        source: 'motor',
        signal: `cart.value a ${brl(next.from - i.cartValue)} da próxima faixa`,
        action: `inject(threshold_nudge: "faltam ${brl(next.from - i.cartValue)} para ${next.max}x")`,
        hypothesis: 'Uma meta de parcelamento próxima estimula adicionar um item',
        kpi: 'AOV',
        guardrail: 'abandono de checkout',
      })
    }
  }

  // 4. Regras do lojista que dependem de contexto
  const mixAvailable = i.paymentMix && methodOrder.length >= 2
  if (i.paymentMix && !mixAvailable) {
    decisions.push({
      source: 'motor',
      signal: 'merchant.payment_mix = on · < 2 métodos aceitos',
      action: 'suppress(payment_mix)',
      hypothesis: 'Não oferecer uma combinação que o comprador não consegue fazer',
    })
  }
  if (methodOrder.length === 1) {
    decisions.push({
      source: 'motor',
      signal: `merchant aceita só ${METHOD_LABEL[methodOrder[0]]}`,
      action: `autoselect(${methodOrder[0]})`,
      hypothesis: 'Menos cliques quando não existe escolha a fazer',
    })
  }

  const pickupAvailable = i.pickup && i.profile !== 'new'
  const pickupRecommended = pickupAvailable && !i.shippingAlreadyFree
  if (i.pickup) {
    decisions.push(
      pickupAvailable
        ? {
            source: 'motor',
            signal: 'address.cep = 01304-001 · loja a 1,2 km',
            action: pickupRecommended
              ? 'offer(pickup) + rank(1) + badge("recomendado")'
              : 'offer(pickup) sem destaque · frete já é grátis',
            hypothesis: 'Retirada zera o frete e entrega no mesmo dia',
            kpi: 'share de retirada · custo logístico',
            guardrail: 'NPS de entrega',
          }
        : {
            source: 'motor',
            signal: 'segment = new_user · endereço desconhecido',
            action: 'hide(pickup) · frete expresso grátis já aplicado',
            hypothesis: 'Sem CEP não dá para garantir uma loja próxima',
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
  const [couponError, setCouponError] = useState('')

  // O dispositivo real é o ponto de partida; o painel permite simular o outro.
  useEffect(() => {
    if (window.matchMedia('(max-width: 767px)').matches) setDevice('mobile')
  }, [])

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
    setCouponError('')
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
      setCouponError('')
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
      setCouponError('Cupom inválido ou expirado.')
      return
    }
    setAppliedCoupon(coupon)
    setCouponError('')
  }

  const removeCoupon = () => {
    setAppliedCoupon(null)
    setCouponInput('')
    setCouponError('')
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
    const shippingValue = hasFreeShippingUnlock || couponFreeShipping ? 0 : SHIPPING[shipping].price
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
    [profile, device, enabledMethods, toggles.paymentMix, toggles.pickup, methods, cartValue, totals, hasFreeShippingUnlock, couponFreeShipping],
  )

  const installmentCount = Math.min(
    installmentsChoice ?? (profile === 'card' ? engine.maxInstallments : 1),
    engine.maxInstallments,
  )

  const decisions = useMemo(() => {
    const log: Decision[] = [...engine.decisions]
    if (toggles.vtexAds)
      log.push({
        source: 'lojista',
        signal: 'app vtex_ads = on · segment',
        action: 'mount(sponsored_ad) + mount(cross_sell → frete grátis)',
        hypothesis: 'Receita de retail media no momento de maior intenção de compra',
        kpi: 'receita de Ads · CTR',
        guardrail: 'conversão do checkout',
      })
    if (toggles.socialShare)
      log.push({
        source: 'lojista',
        signal: 'module social_share = on',
        action: 'mount(opt_in: dividir com um amigo)',
        hypothesis: 'Dividir o pagamento destrava compras acima do orçamento individual',
        kpi: 'conversão · novos compradores via link',
        guardrail: 'pedidos não concluídos pelo amigo',
      })
    if (toggles.saveForLater)
      log.push({
        source: 'lojista',
        signal: 'app save_for_later = on',
        action: 'mount(cart.save_action)',
        hypothesis: 'Tirar um item é melhor do que abandonar o carrinho inteiro',
        kpi: 'recuperação de itens salvos',
      })
    if (toggles.coupons)
      log.push({ source: 'lojista', signal: 'module coupons = on', action: 'mount(coupon_input)' })
    if (toggles.socialShare && wantsSocialShare)
      log.push({
        source: 'comprador',
        signal: 'social_share.opt_in = true',
        action: 'pricing.customer_share = 50% · post_purchase.mount(share_link, ttl=2h)',
      })
    if (toggles.vtexAds && cartItems.some((i) => i.upsell))
      log.push({ source: 'comprador', signal: 'cross_sell.added', action: 'shipping.override(free)' })
    if (toggles.coupons && appliedCoupon)
      log.push({
        source: 'comprador',
        signal: `coupon = ${appliedCoupon.code}`,
        action: `pricing.override(${appliedCoupon.type === 'percent' ? `-${appliedCoupon.value * 100}%` : 'frete grátis'})`,
      })
    return log
  }, [engine, toggles, wantsSocialShare, cartItems, appliedCoupon])

  const shippingLabel =
    shipping === 'pickup'
      ? 'Retirada na loja · Allmart Paulista'
      : isNewUser
        ? 'Frete Expresso · Grátis'
        : totals.shippingValue === 0
          ? `${SHIPPING[shipping].label} · Grátis`
          : `${SHIPPING[shipping].label} · ${brl(totals.shippingValue)}`

  const confirmOrder = () => {
    setPlaced(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-dvh bg-muted/40">
      <DebugPanel
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
          <ol className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex" aria-label="Etapas do checkout">
            <li className="flex items-center gap-1.5">
              <Check className="size-4 text-success" aria-hidden="true" /> Carrinho
            </li>
            <li aria-hidden="true">/</li>
            <li className={placed ? 'flex items-center gap-1.5' : 'font-medium text-foreground'} aria-current={placed ? undefined : 'step'}>
              {placed && <Check className="size-4 text-success" aria-hidden="true" />} Entrega e Pagamento
            </li>
            <li aria-hidden="true">/</li>
            <li className={placed ? 'font-medium text-foreground' : ''} aria-current={placed ? 'step' : undefined}>
              Confirmação
            </li>
          </ol>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-4" aria-hidden="true" /> Ambiente seguro
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
                    Pagamento
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {engine.mixAvailable
                      ? `Combine até ${MAX_MIXED_METHODS} meios de pagamento.`
                      : 'Escolha como deseja pagar o seu pedido.'}
                  </p>
                </div>
                {engine.mixAvailable && <ExtensionBadge label="payment-mix" />}
              </div>

              <div
                className="overflow-hidden rounded-xl border bg-background"
                role={engine.mixAvailable ? 'group' : 'radiogroup'}
                aria-label="Meios de pagamento"
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
                        description={
                          engine.pixMode === 'copy'
                            ? '5% de desconto · copia e cola no app do banco'
                            : '5% de desconto · aprovação imediata'
                        }
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
                              Valor no Pix: <span className="text-success tabular-nums">{brl(amountFor('pix'))}</span>
                            </p>
                            <p className="text-muted-foreground">
                              {engine.pixMode === 'copy'
                                ? 'Depois de confirmar, você copia o código e cola no app do seu banco. Válido por 10 minutos.'
                                : 'O QR Code é gerado após confirmar. Válido por 10 minutos.'}
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
                        title="Cartão de Crédito"
                        description={
                          engine.maxInstallments > 1 ? `Até ${engine.maxInstallments}x sem juros` : 'À vista'
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
                                  Economize {brl(totals.pixSavings)} fechando no Pix agora
                                </p>
                                <p className="text-xs text-muted-foreground">Aprovação instantânea e 5% de desconto no total.</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={nudgeToPix}
                              className="shrink-0 rounded-md bg-success px-3 py-2 text-sm font-medium text-success-foreground transition-opacity hover:opacity-90"
                            >
                              {engine.mixAvailable && methods.length < MAX_MIXED_METHODS ? 'Combinar com Pix' : 'Mudar para Pix'}
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
                      description="Buy Now, Pay Later · 4x sem juros"
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
                      <p className="text-sm font-semibold">Adicionar Garantia Estendida por + {brl(WARRANTY_PRICE)}</p>
                      <p className="text-xs text-muted-foreground">12 meses extras de cobertura para o seu pedido.</p>
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
                    {warranty ? 'Adicionada' : '1-click'}
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
                      <p className="text-sm font-semibold">Quero dividir esta compra com um amigo</p>
                      <ExtensionBadge label="social-share" />
                    </div>
                    <p className="text-sm text-muted-foreground text-pretty">
                      Marque para pagar só a sua metade agora ({brl(totals.orderTotal / 2)}). Depois de confirmar,
                      você envia um link para um amigo pagar o restante.
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
            couponError={couponError}
          />
        </main>
      )}
    </div>
  )
}

function isMethodLocked(method: PaymentMethod, methods: PaymentMethod[], multi: boolean) {
  return multi && methods.length >= MAX_MIXED_METHODS && !methods.includes(method)
}

const SOURCE_STYLE: Record<DecisionSource, string> = {
  motor: 'border-emerald-400/40 text-emerald-300',
  lojista: 'border-sky-400/40 text-sky-300',
  comprador: 'border-amber-400/40 text-amber-300',
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
  const [showLog, setShowLog] = useState(true)
  const enabledCount = Object.values(enabledMethods).filter(Boolean).length

  return (
    <section aria-label="Painel de simulação" className="border-b border-white/10 bg-zinc-950 text-zinc-300">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs">
            <Terminal className="size-4 text-emerald-400" aria-hidden="true" />
            <span className="font-semibold uppercase tracking-wider text-zinc-100">Debug Mode</span>
            <span className="text-zinc-500">· o lojista define as regras, o motor personaliza dentro delas</span>
          </div>
          <button
            type="button"
            onClick={() => setShowLog((s) => !s)}
            aria-expanded={showLog}
            className="flex shrink-0 items-center gap-1 font-mono text-xs text-zinc-400 hover:text-zinc-100"
          >
            <Bot className="size-3.5" aria-hidden="true" /> decisões
            <ChevronDown className={`size-3.5 transition-transform ${showLog ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_1.35fr]">
          <PanelLayer step={1} title="Sinais do comprador" subtitle="Quem está comprando e em que contexto">
            <PanelGroup label="clientProfileData · segmento">
              <Segmented options={PROFILE_OPTIONS} value={profile} onChange={onProfileChange} />
            </PanelGroup>
            <PanelGroup label="tempo real · dispositivo">
              <Segmented
                options={[
                  { value: 'mobile', label: 'Mobile', icon: Smartphone },
                  { value: 'desktop', label: 'Desktop', icon: Monitor },
                ]}
                value={device}
                onChange={onDeviceChange}
              />
            </PanelGroup>
            <PanelGroup label="tempo real · valor do carrinho">
              <span className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-zinc-200 tabular-nums">
                {brl(cartValue)} → até {maxInstallments}x sem juros
              </span>
            </PanelGroup>
          </PanelLayer>

          <PanelLayer step={2} title="Regras do lojista" subtitle="O que a loja aceita e quais apps estão instalados">
            <PanelGroup label="payment.methods">
              <DebugToggle
                label="Pix"
                icon={QrCode}
                checked={enabledMethods.pix}
                disabled={enabledMethods.pix && enabledCount === 1}
                onChange={(v) => onMethodEnabled('pix', v)}
              />
              <DebugToggle
                label="Cartão"
                icon={CreditCard}
                checked={enabledMethods.card}
                disabled={enabledMethods.card && enabledCount === 1}
                onChange={(v) => onMethodEnabled('card', v)}
              />
              <DebugToggle
                label="Koin (BNPL)"
                icon={Wallet}
                checked={enabledMethods.koin}
                disabled={enabledMethods.koin && enabledCount === 1}
                onChange={(v) => onMethodEnabled('koin', v)}
              />
            </PanelGroup>
            <PanelGroup label="payment.modules">
              <DebugToggle
                label="Mix de Pagamentos"
                icon={SlidersHorizontal}
                checked={toggles.paymentMix}
                onChange={(v) => onToggle('paymentMix', v)}
              />
              <DebugToggle label="Cupons" icon={Tag} checked={toggles.coupons} onChange={(v) => onToggle('coupons', v)} />
              <DebugToggle
                label="Social Share"
                icon={Share2}
                checked={toggles.socialShare}
                onChange={(v) => onToggle('socialShare', v)}
              />
            </PanelGroup>
            <PanelGroup label="extra.apps">
              <DebugToggle label="VTEX Ads" icon={Megaphone} checked={toggles.vtexAds} onChange={(v) => onToggle('vtexAds', v)} />
              <DebugToggle
                label="Save for Later"
                icon={Heart}
                checked={toggles.saveForLater}
                onChange={(v) => onToggle('saveForLater', v)}
              />
              <DebugToggle
                label="Retirada na loja"
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
              Decisões do motor
              <span className="font-normal text-zinc-500">· o que o checkout fez, por quê e como medimos</span>
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
                    {d.source}
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
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      title={disabled ? 'A loja precisa aceitar ao menos um método' : undefined}
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

const AD_BY_PROFILE: Record<BuyerProfile, { brand: string; title: string; description: string; image: string; price: number }> = {
  new: {
    brand: 'StepGuard',
    title: 'Kit Impermeabilizante para Tênis',
    description: 'Anúncio da StepGuard para novos clientes: 20% OFF no primeiro kit, protegendo seu tênis já na estreia.',
    image: '/products/spray.png',
    price: 24.9 * 0.8,
  },
  pix: {
    brand: 'ConfortMax',
    title: 'Palmilha Gel ConfortMax',
    description: 'Anúncio da ConfortMax: clientes que pagam no Pix aprovam na hora e ganham frete grátis nesta palmilha.',
    image: '/products/palmilha.png',
    price: 29.9,
  },
  card: {
    brand: 'RunLace',
    title: 'Cadarço Premium RunLace',
    description: 'Anúncio da RunLace: baseado no seu perfil de cartão, parcele os acessórios em até 3x sem juros.',
    image: '/products/cadarco.png',
    price: 19.9,
  },
}

function VtexAdsBanner({ profile }: { profile: BuyerProfile }) {
  const ad = AD_BY_PROFILE[profile]
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
            Patrocinado
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

  return (
    <section aria-labelledby="delivery-title" className="flex flex-col gap-4">
      <div>
        <h1 id="delivery-title" className="text-2xl font-semibold tracking-tight">
          Entrega
        </h1>
        <p className="text-sm text-muted-foreground">
          {isNewUser ? 'Primeira compra? Complete um cadastro rápido.' : 'Confirme o endereço e a modalidade de envio.'}
        </p>
      </div>

      <div className="flex flex-col gap-5 rounded-xl border bg-background p-5">
        {isNewUser ? (
          <div className="grid gap-3 animate-in fade-in slide-in-from-top-1 duration-300 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs font-medium sm:col-span-2">
              Nome completo
              <input className={inputClass} name="name" autoComplete="name" placeholder="Como no seu documento" />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium">
              CPF
              <input className={inputClass} name="cpf" inputMode="numeric" maxLength={14} placeholder="000.000.000-00" />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium">
              Celular
              <input className={inputClass} name="phone" type="tel" autoComplete="tel" placeholder="(11) 90000-0000" />
            </label>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/40 p-4 animate-in fade-in duration-300">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-medium">Casa</p>
                <p className="text-muted-foreground">Rua Augusta, 1500 · Apto 42 — São Paulo/SP · 01304-001</p>
              </div>
            </div>
            <button type="button" className="shrink-0 text-xs font-medium text-primary hover:underline">
              Alterar
            </button>
          </div>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-xs font-medium">Modalidade de envio</legend>
          {isNewUser ? (
            <label className="flex cursor-not-allowed items-center gap-4 rounded-lg border-2 border-success bg-success/10 p-4 animate-in fade-in zoom-in-95 duration-300">
              <input type="radio" name="shipping" checked disabled readOnly className="size-4 accent-[var(--success)]" />
              <Truck className="size-5 shrink-0 text-success" aria-hidden="true" />
              <span className="flex-1">
                <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  Frete Expresso - GRÁTIS
                  <span className="inline-flex items-center gap-1 rounded bg-success px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success-foreground">
                    <Gift className="size-3" aria-hidden="true" /> Benefício ganho
                  </span>
                </span>
                <span className="block text-xs text-muted-foreground">
                  1 a 2 dias úteis · presente de boas-vindas para a sua primeira compra
                </span>
              </span>
              <span className="flex flex-col items-end">
                <span className="text-xs text-muted-foreground line-through tabular-nums">{brl(SHIPPING.express.price)}</span>
                <Lock className="size-4 text-success" aria-label="Opção travada" />
              </span>
            </label>
          ) : (
            shippingOptions.map((key) => {
              const option = SHIPPING[key]
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
                          Recomendado · economize {brl(SHIPPING.standard.price)}
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-muted-foreground">{option.eta}</span>
                  </span>
                  <span className={`text-sm font-medium tabular-nums ${isPickup ? 'text-success' : ''}`}>
                    {option.price === 0 ? 'Grátis' : brl(option.price)}
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
          <span className="block text-xs text-muted-foreground">{disabled ? `Máximo de ${MAX_MIXED_METHODS} meios atingido` : description}</span>
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
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="col-span-2 flex flex-col gap-1.5 text-xs font-medium">
        Número do cartão
        <input className={inputClass} inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" />
      </label>
      <label className="col-span-2 flex flex-col gap-1.5 text-xs font-medium">
        Nome impresso no cartão
        <input className={inputClass} autoComplete="cc-name" placeholder="Como aparece no cartão" />
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-medium">
        Validade
        <input className={inputClass} autoComplete="cc-exp" placeholder="MM/AA" />
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-medium">
        CVV
        <input className={inputClass} inputMode="numeric" autoComplete="cc-csc" placeholder="123" />
      </label>
      <label className="col-span-2 flex flex-col gap-1.5 text-xs font-medium">
        Parcelas
        <select
          className={inputClass}
          value={installments}
          onChange={(e) => onInstallmentsChange(Number(e.target.value))}
        >
          {Array.from({ length: maxInstallments }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n === 1 ? `À vista · ${brl(amount)}` : `${n}x de ${brl(amount / n)} sem juros`}
            </option>
          ))}
        </select>
        {limitedByMin && (
          <span className="font-normal text-muted-foreground">
            Parcela mínima de {brl(MIN_INSTALLMENT_VALUE)}.
          </span>
        )}
      </label>
    </div>
  )
}

function KoinPlan({ amount }: { amount: number }) {
  const labels = ['Hoje', '30 dias', '60 dias', '90 dias']
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        <span className="font-medium">4x de {brl(amount / 4)}</span>{' '}
        <span className="text-muted-foreground">sem juros · aprovação em segundos só com CPF</span>
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
  if (amounts.length < 2) return null
  const [first, second] = amounts
  return (
    <div className="rounded-xl border bg-background p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal className="size-4 text-primary" aria-hidden="true" />
          Divida o valor entre os meios
        </p>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {first.percent}% / {second.percent}%
        </span>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-3">
        {[first, second].map((entry, i) => (
          <div key={entry.method} className={`rounded-lg border p-3 ${i === 1 ? 'text-right' : ''}`}>
            <p className="text-xs text-muted-foreground">{METHOD_LABEL[entry.method]}</p>
            <p className="text-lg font-semibold tabular-nums">{brl(entry.amount)}</p>
          </div>
        ))}
      </div>
      <label className="flex flex-col gap-2">
        <span className="sr-only">
          Porcentagem do total paga com {METHOD_LABEL[first.method]}
        </span>
        <input
          type="range"
          min={10}
          max={90}
          step={5}
          value={split}
          onChange={(e) => onSplitChange(Number(e.target.value))}
          aria-valuetext={`${first.percent}% ${METHOD_LABEL[first.method]}, ${second.percent}% ${METHOD_LABEL[second.method]}`}
          className="h-2 w-full cursor-pointer accent-[var(--primary)]"
        />
        <span className="flex justify-between text-[11px] text-muted-foreground">
          <span>Mais em {METHOD_LABEL[second.method]}</span>
          <span>Mais em {METHOD_LABEL[first.method]}</span>
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
  couponError,
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
  couponError: string
}) {
  return (
    <aside aria-labelledby="summary-title" className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
      <div className="rounded-xl border bg-background">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 id="summary-title" className="font-semibold">
            Resumo do pedido
          </h2>
          <span className="text-sm text-muted-foreground">{cartItems.length} itens</span>
        </div>

        <ul className="px-5">
          {cartItems.map((item) => (
            <li key={item.id} className="flex gap-3 border-b py-4 last:border-b-0">
              <div className="relative size-16 shrink-0 overflow-hidden rounded-md border bg-muted">
                <Image src={item.image || '/placeholder.svg'} alt={item.name} fill sizes="64px" className="object-cover" />
              </div>
              <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    {item.upsell && <ExtensionBadge label="vtex-ads" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{item.variant}</p>
                  {saveForLaterEnabled && (
                    <button
                      type="button"
                      onClick={() => onSaveForLater(item.id)}
                      className="mt-1 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <Heart className="size-3" aria-hidden="true" />
                      Salvar para depois
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
          const headline = isPickup
            ? 'Leve junto na retirada'
            : unlocked
              ? 'Frete grátis liberado com o item adicionado 🎉'
              : 'Complete o pedido e ganhe frete grátis'
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
                        <Image src={product.image || '/placeholder.svg'} alt={product.name} fill sizes="48px" className="object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{brl(product.price)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onAddUpsell(product)}
                        className="flex shrink-0 items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted"
                      >
                        <Plus className="size-3" aria-hidden="true" />
                        Adicionar
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
              <span className="text-xs font-medium text-muted-foreground">Guardados para depois ({savedItems.length})</span>
            </div>
            <ul className="flex flex-col gap-3">
              {savedItems.map((item) => (
                <li key={item.id} className="flex items-center gap-3 opacity-80">
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-md border bg-muted">
                    <Image src={item.image || '/placeholder.svg'} alt={item.name} fill sizes="48px" className="object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{brl(item.price)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onMoveBackToCart(item.id)}
                    className="shrink-0 rounded-md border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted"
                  >
                    Mover para o carrinho
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
              <span className="text-xs font-medium text-muted-foreground">Cupom de desconto</span>
            </div>
            {appliedCoupon ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/5 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Tag className="size-4 shrink-0 text-success" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-success">{appliedCoupon.code}</p>
                    <p className="text-xs text-muted-foreground">{appliedCoupon.label}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onRemoveCoupon}
                  className="shrink-0 rounded-md border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted"
                >
                  Remover
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
                    placeholder="Código do cupom"
                    className={`${inputClass} uppercase`}
                  />
                  <button
                    type="button"
                    onClick={onApplyCoupon}
                    disabled={!couponInput.trim()}
                    className="shrink-0 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Aplicar
                  </button>
                </div>
                {couponError && <p className="text-xs font-medium text-destructive">{couponError}</p>}
                <p className="text-[11px] text-muted-foreground">Experimente BEMVINDO10 ou FRETEGRATIS.</p>
              </div>
            )}
          </div>
        )}

        <dl className="flex flex-col border-t px-5 py-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums">{brl(totals.subtotal)}</dd>
          </div>
          <Collapse innerClassName="pt-2" open={warranty}>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Garantia Estendida</dt>
              <dd className="tabular-nums">{brl(WARRANTY_PRICE)}</dd>
            </div>
          </Collapse>
          <div className="flex justify-between pt-2">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <Truck className="size-4" aria-hidden="true" /> Frete
            </dt>
            <dd className={`tabular-nums ${totals.shippingValue === 0 ? 'font-medium text-success' : ''}`}>
              {totals.shippingValue === 0 ? 'Grátis' : brl(totals.shippingValue)}
            </dd>
          </div>
          <Collapse innerClassName="pt-2" open={totals.discount - totals.couponDiscount > 0}>
            <div className="flex justify-between text-success">
              <dt>Desconto Pix (5%)</dt>
              <dd className="tabular-nums">- {brl(totals.discount - totals.couponDiscount)}</dd>
            </div>
          </Collapse>
          <Collapse innerClassName="pt-2" open={totals.couponDiscount > 0}>
            <div className="flex justify-between text-success">
              <dt className="flex items-center gap-1.5">
                <Tag className="size-3.5" aria-hidden="true" />
                Cupom {appliedCoupon?.code}
              </dt>
              <dd className="tabular-nums">- {brl(totals.couponDiscount)}</dd>
            </div>
          </Collapse>
          <Collapse innerClassName="pt-2" open={totals.customerShare < 1}>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-success/5 px-3 py-2 text-success">
              <dt className="flex items-center gap-1.5 font-medium">
                <Users className="size-3.5" aria-hidden="true" />
                Compra dividida com um amigo
              </dt>
              <dd className="text-xs text-muted-foreground">Pedido: {brl(totals.orderTotal)}</dd>
            </div>
          </Collapse>
          <div className="mt-2 flex items-baseline justify-between border-t pt-3">
            <dt className="font-semibold">{totals.customerShare < 1 ? 'Você paga agora (50%)' : 'Total'}</dt>
            <dd className="text-xl font-semibold tabular-nums" aria-live="polite">
              {brl(totals.total)}
            </dd>
          </div>
          <Collapse innerClassName="pt-2" open={totals.customerShare < 1}>
            <p className="text-right text-xs text-muted-foreground">
              Seu amigo paga {brl(totals.friendAmount)} depois, pelo link
            </p>
          </Collapse>
          {installments > 1 && (
            <p className="pt-2 text-right text-xs text-muted-foreground">
              {installments}x de {brl(totals.total / installments)} sem juros
            </p>
          )}
          <Collapse innerClassName="pt-2" open={!!thresholdNudge}>
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
              <CreditCard className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span>
                Faltam <strong className="tabular-nums">{brl(thresholdNudge?.missing ?? 0)}</strong> para parcelar em até{' '}
                <strong>{thresholdNudge?.max}x sem juros</strong>
              </span>
            </div>
          </Collapse>
          <Collapse innerClassName="pt-2" open={isSplit}>
            <ul className="flex flex-col gap-1 rounded-lg bg-muted/60 p-3 text-xs">
              {totals.amounts.map((a) => (
                <li key={a.method} className="flex justify-between">
                  <span className="text-muted-foreground">
                    {METHOD_LABEL[a.method]} · {a.percent}%
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
            {canConfirm ? 'Confirmar pedido' : 'Selecione um pagamento'}
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
  const pix = amounts.find((a) => a.method === 'pix')
  const shareText = encodeURIComponent(
    `Oi! Reservei um pedido na Allmart (#${ORDER_ID}). Falta ${brl(friendAmount)} para finalizar — o link expira em 2h: https://allmart.example/pagar/${ORDER_ID}`,
  )

  const methodDetail = (a: (typeof amounts)[number]) => {
    if (a.method === 'card') return installments > 1 ? `${installments}x de ${brl(a.amount / installments)}` : 'À vista'
    if (a.method === 'koin') return `4x de ${brl(a.amount / 4)}`
    return 'Aguardando pagamento'
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-8 md:py-12 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-success/10">
          <CircleCheckBig className="size-7 text-success" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {socialShare ? 'Pedido reservado! Falta a metade do valor.' : 'Pedido confirmado!'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pedido <span className="font-mono font-medium text-foreground">#{ORDER_ID}</span> · {shippingLabel}
          </p>
        </div>
      </div>

      {pix && (
        <section aria-labelledby="pix-title" className="flex flex-col items-center gap-4 rounded-xl border bg-background p-6 text-center">
          <div>
            <h2 id="pix-title" className="font-semibold">
              Pague {brl(pix.amount)} com Pix
            </h2>
            <p className="text-sm text-muted-foreground">
              {pixMode === 'copy'
                ? 'Copie o código e cole na área Pix do app do seu banco.'
                : 'Escaneie o QR Code no app do seu banco.'}
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
                  Divida com um amigo
                </h2>
                <ExtensionBadge label="social-share" />
              </div>
              <p className="text-sm text-muted-foreground text-pretty">
                Você garantiu o pedido. O restante ({brl(friendAmount)}) pode ser pago por outra pessoa pelo link.
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
            Enviar link de pagamento para um amigo finalizar (Expira em 2h)
          </a>
        </section>
      )}

      <section aria-labelledby="payment-summary-title" className="rounded-xl border bg-background">
        <h2 id="payment-summary-title" className="border-b px-5 py-3 text-sm font-semibold">
          Resumo do pagamento
        </h2>
        <ul className="flex flex-col px-5">
          {amounts.map((a) => (
            <li key={a.method} className="flex items-center justify-between gap-3 border-b py-3 text-sm last:border-b-0">
              <div>
                <p className="font-medium">
                  {METHOD_LABEL[a.method]}
                  {amounts.length > 1 && <span className="ml-1.5 text-xs text-muted-foreground">{a.percent}%</span>}
                </p>
                <p className="text-xs text-muted-foreground">{methodDetail(a)}</p>
              </div>
              <span className="font-medium tabular-nums">{brl(a.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t px-5 py-3 text-sm">
          <span className="font-semibold">Total</span>
          <span className="font-semibold tabular-nums">{brl(total)}</span>
        </div>
      </section>

      <button
        type="button"
        onClick={onBack}
        className="flex items-center justify-center gap-2 rounded-lg border bg-background px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
      >
        <RotateCcw className="size-4" aria-hidden="true" />
        Voltar ao Checkout
      </button>
    </main>
  )
}

function PixCountdown() {
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
      {expired ? 'Código expirado' : 'Expira em'}
      <span className="font-mono tabular-nums">
        {mm}:{ss}
      </span>
    </p>
  )
}

function CopyPixButton({ primary = false }: { primary?: boolean }) {
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
      {copied ? 'Código copiado' : 'Copiar Pix Copia e Cola'}
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
      aria-label="QR Code Pix para pagamento"
    >
      {cells.map(([r, c]) => (
        <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#09090b" />
      ))}
    </svg>
  )
}
