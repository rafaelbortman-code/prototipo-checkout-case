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
  Plus,
  QrCode,
  RotateCcw,
  Share2,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
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
type PaymentMethod = 'pix' | 'card' | 'koin'
type ShippingOption = 'standard' | 'express'
type Toggles = { paymentMix: boolean; socialShare: boolean; vtexAds: boolean; saveForLater: boolean; coupons: boolean }

type CartItem = {
  id: string
  name: string
  variant: string
  price: number
  image: string
  upsell?: boolean
}

const CART: CartItem[] = [
  { id: 'fogao', name: 'Fogão 5 Bocas Inox Turbo', variant: 'Inox · Mesa de Vidro', price: 1899, image: '/placeholder.svg' },
  { id: 'panela', name: 'Panela de Pressão Elétrica Digital', variant: '6 Litros · Preta', price: 349, image: '/placeholder.svg' },
]

const UPSELL_PRODUCTS: CartItem[] = [
  { id: 'kit-limpeza', name: 'Kit Limpeza para Inox', variant: 'Kit com 3 itens', price: 39.9, image: '/placeholder.svg', upsell: true },
  { id: 'mangueira', name: 'Mangueira de Gás Extra Flexível', variant: '1,5m · Certificada', price: 49.9, image: '/placeholder.svg', upsell: true },
  { id: 'regulador', name: 'Regulador de Gás de Alta Precisão', variant: 'Universal', price: 34.9, image: '/placeholder.svg', upsell: true },
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
}

const PIX_DISCOUNT_RATE = 0.05
const WARRANTY_PRICE = 39.9
const MAX_MIXED_METHODS = 2
const PIX_TIMER_SECONDS = 10 * 60
const ORDER_ID = 'EL-240927'

type Coupon = { code: string; label: string; type: 'percent' | 'shipping'; value: number }

const COUPONS: Record<string, Coupon> = {
  BEMVINDO10: { code: 'BEMVINDO10', label: '10% OFF no pedido', type: 'percent', value: 0.1 },
  FRETEGRATIS: { code: 'FRETEGRATIS', label: 'Frete grátis', type: 'shipping', value: 0 },
}

const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function Collapse({ open, children, className = '' }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-500 ease-out ${
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      } ${className}`}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
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
  const [profile, setProfile] = useState<BuyerProfile>('card')
  const [toggles, setToggles] = useState<Toggles>({
    paymentMix: false,
    socialShare: false,
    vtexAds: false,
    saveForLater: false,
    coupons: false,
  })
  const [methods, setMethods] = useState<PaymentMethod[]>(['card'])
  const [split, setSplit] = useState(50)
  const [shipping, setShipping] = useState<ShippingOption>('standard')
  const [warranty, setWarranty] = useState(false)
  const [installments, setInstallments] = useState('1')
  const [placed, setPlaced] = useState(false)
  const [wantsSocialShare, setWantsSocialShare] = useState(false)
  const [cartItems, setCartItems] = useState<CartItem[]>(CART)
  const [savedItems, setSavedItems] = useState<CartItem[]>([])
  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null)
  const [couponError, setCouponError] = useState('')

  const isNewUser = profile === 'new'
  const hasFreeShippingUnlock = isNewUser || cartItems.some((i) => i.upsell)
  const isSplit = toggles.paymentMix && methods.length === MAX_MIXED_METHODS

  const resetCheckout = (nextProfile: BuyerProfile = profile) => {
    const preferred = PREFERRED_METHOD[nextProfile]
    setMethods(preferred ? [preferred] : [])
    setSplit(50)
    setShipping('standard')
    setWarranty(false)
    setInstallments('1')
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

  const setToggle = (key: keyof Toggles, value: boolean) => {
    setToggles((t) => ({ ...t, [key]: value }))
    if (key === 'paymentMix' && !value) setMethods((m) => m.slice(0, 1))
    if (key === 'socialShare' && !value) setWantsSocialShare(false)
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
    if (!toggles.paymentMix) {
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
    if (toggles.paymentMix && methods.length < MAX_MIXED_METHODS && !methods.includes('pix')) {
      setMethods((m) => [...m, 'pix'])
    } else {
      setMethods(['pix'])
    }
  }

  const totals = useMemo(() => {
    const subtotal = cartItems.reduce((sum, item) => sum + item.price, 0)
    const warrantyValue = warranty ? WARRANTY_PRICE : 0
    const couponFreeShipping = toggles.coupons && appliedCoupon?.type === 'shipping'
    const shippingValue = hasFreeShippingUnlock || couponFreeShipping ? 0 : SHIPPING[shipping].price
    const base = subtotal + warrantyValue + shippingValue

    const shares = new Map<PaymentMethod, number>()
    if (methods.length === 1) shares.set(methods[0], 1)
    if (methods.length === 2) {
      shares.set(methods[0], split / 100)
      shares.set(methods[1], 1 - split / 100)
    }

    const pixSavings = base * PIX_DISCOUNT_RATE
    const pixDiscount = base * (shares.get('pix') ?? 0) * PIX_DISCOUNT_RATE
    const couponDiscount =
      toggles.coupons && appliedCoupon?.type === 'percent' ? (base - pixDiscount) * appliedCoupon.value : 0
    const discount = pixDiscount + couponDiscount
    const total = base - discount
    const amounts = methods.map((m) => {
      const share = shares.get(m) ?? 0
      const methodPixDiscount = m === 'pix' ? pixDiscount : 0
      const methodCouponDiscount = couponDiscount * share
      return {
        method: m,
        percent: Math.round(share * 100),
        amount: base * share - methodPixDiscount - methodCouponDiscount,
      }
    })

    return { subtotal, warrantyValue, shippingValue, pixSavings, discount, couponDiscount, total, amounts }
  }, [warranty, hasFreeShippingUnlock, shipping, methods, split, cartItems, toggles.coupons, appliedCoupon])

  const amountFor = (m: PaymentMethod) => totals.amounts.find((a) => a.method === m)?.amount ?? totals.total

  const agentDecisions = useMemo(() => {
    const log: string[] = []
    if (profile === 'card') log.push('card_affinity → expand(card) + inject(pix_nudge) · reduz MDR')
    if (profile === 'pix') log.push('pix_affinity → expand(pix) + inject(upsell_warranty) · +AOV')
    if (profile === 'new') log.push('new_user → mount(signup_lite) + lock(shipping.express = free) · ativação')
    if (toggles.vtexAds) log.push('mod.vtex_ads → clientProfileData.segment → mount(sponsored_recommendation) · personalização por perfil')
    if (toggles.paymentMix) log.push(`mod.payment_mix → mode(multi, max=${MAX_MIXED_METHODS}) + mount(split_slider)`)
    if (toggles.socialShare) log.push('mod.social_share → checkout.mount(opt_in_toggle) · disponível para o cliente escolher')
    if (toggles.socialShare && wantsSocialShare)
      log.push('client.social_share = true → post_purchase.mount(share_link, ttl=2h) · viral loop')
    if (toggles.saveForLater) log.push('mod.save_for_later → cart.mount(save_action) · retenção')
    if (toggles.vtexAds && cartItems.some((i) => i.upsell))
      log.push('client.cross_sell_added → shipping.override(free) · +AOV via vtex_ads')
    if (toggles.coupons) log.push('mod.coupons → checkout.mount(coupon_input) · disponível para o cliente')
    if (toggles.coupons && appliedCoupon)
      log.push(`client.coupon_applied(${appliedCoupon.code}) → pricing.override(${appliedCoupon.type}) · -${appliedCoupon.type === 'percent' ? `${appliedCoupon.value * 100}%` : 'frete'}`)
    return log
  }, [profile, toggles, wantsSocialShare, cartItems, appliedCoupon])

  const confirmOrder = () => {
    setPlaced(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-dvh bg-muted/40">
      <DebugPanel
        profile={profile}
        onProfileChange={changeProfile}
        toggles={toggles}
        onToggle={setToggle}
        decisions={agentDecisions}
      />

      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShoppingBag className="size-4" aria-hidden="true" />
            </div>
            <span className="font-semibold tracking-tight">ElectroLar</span>
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
          installments={Number(installments)}
          socialShare={toggles.socialShare && wantsSocialShare}
          shippingLabel={hasFreeShippingUnlock ? 'Frete Expresso · Grátis' : `${SHIPPING[shipping].label} · ${brl(totals.shippingValue)}`}
          onBack={() => resetCheckout()}
        />
      ) : (
        <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:px-6 lg:grid-cols-[1fr_400px] lg:py-10">
          <div className="flex flex-col gap-8">
            <DeliverySection isNewUser={isNewUser} shipping={shipping} onShippingChange={setShipping} />

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
                    {toggles.paymentMix
                      ? `Combine até ${MAX_MIXED_METHODS} meios de pagamento.`
                      : 'Escolha como deseja pagar o seu pedido.'}
                  </p>
                </div>
                {toggles.paymentMix && <ExtensionBadge label="payment-mix" />}
              </div>

              <div
                className="overflow-hidden rounded-xl border bg-background"
                role={toggles.paymentMix ? 'group' : 'radiogroup'}
                aria-label="Meios de pagamento"
              >
                <PaymentOption
                  id="pix"
                  icon={QrCode}
                  title="Pix"
                  description="5% de desconto · aprovação imediata"
                  badge="-5%"
                  multi={toggles.paymentMix}
                  selected={methods.includes('pix')}
                  disabled={isMethodLocked('pix', methods, toggles.paymentMix)}
                  onSelect={() => toggleMethod('pix')}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="flex size-24 shrink-0 items-center justify-center rounded-lg border bg-muted">
                      <QrCode className="size-14 text-foreground/80" aria-hidden="true" />
                    </div>
                    <div className="text-sm">
                      <p className="font-medium">
                        Valor no Pix: <span className="text-success tabular-nums">{brl(amountFor('pix'))}</span>
                      </p>
                      <p className="text-muted-foreground">O QR Code é gerado após confirmar. Válido por 10 minutos.</p>
                    </div>
                  </div>
                  <Collapse open={profile === 'pix'}>
                    <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border bg-muted/50 p-4">
                      <div className="flex items-start gap-3">
                        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                        <div>
                          <p className="text-sm font-semibold">Adicionar Garantia Estendida por + {brl(WARRANTY_PRICE)}</p>
                          <p className="text-xs text-muted-foreground">12 meses extras de cobertura para o seu fogão.</p>
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
                </PaymentOption>

                <PaymentOption
                  id="card"
                  icon={CreditCard}
                  title="Cartão de Crédito"
                  description="Até 10x sem juros"
                  multi={toggles.paymentMix}
                  selected={methods.includes('card')}
                  disabled={isMethodLocked('card', methods, toggles.paymentMix)}
                  onSelect={() => toggleMethod('card')}
                >
                  <CardForm amount={amountFor('card')} installments={installments} onInstallmentsChange={setInstallments} />
                  <Collapse open={profile === 'card' && !methods.includes('pix')}>
                    <div className="mt-4 flex flex-col gap-3 rounded-lg border border-success/30 bg-success/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <TrendingDown className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
                        <div>
                          <p className="text-sm font-semibold text-success">Economize {brl(totals.pixSavings)} fechando no Pix agora</p>
                          <p className="text-xs text-muted-foreground">Aprovação instantânea e 5% de desconto no total.</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={nudgeToPix}
                        className="shrink-0 rounded-md bg-success px-3 py-2 text-sm font-medium text-success-foreground transition-opacity hover:opacity-90"
                      >
                        {toggles.paymentMix && methods.length < MAX_MIXED_METHODS ? 'Combinar com Pix' : 'Mudar para Pix'}
                      </button>
                    </div>
                  </Collapse>
                </PaymentOption>

                <PaymentOption
                  id="koin"
                  icon={Wallet}
                  title="Koin"
                  description="Buy Now, Pay Later · 4x sem juros"
                  badge="BNPL"
                  multi={toggles.paymentMix}
                  selected={methods.includes('koin')}
                  disabled={isMethodLocked('koin', methods, toggles.paymentMix)}
                  onSelect={() => toggleMethod('koin')}
                  last
                >
                  <KoinPlan amount={amountFor('koin')} />
                </PaymentOption>
              </div>

              <Collapse open={isSplit}>
                <SplitSlider split={split} onSplitChange={setSplit} amounts={totals.amounts} />
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
                      Marque para pagar só a sua metade agora. Depois de confirmar, você envia um link para um amigo
                      pagar o restante ({brl(totals.total / 2)}).
                    </p>
                  </div>
                </label>
              </Collapse>
            </section>
          </div>

          <OrderSummary
            totals={totals}
            isNewUser={isNewUser}
            warranty={warranty}
            isSplit={isSplit}
            installments={methods.length === 1 && methods[0] === 'card' ? Number(installments) : 1}
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

function DebugPanel({
  profile,
  onProfileChange,
  toggles,
  onToggle,
  decisions,
}: {
  profile: BuyerProfile
  onProfileChange: (p: BuyerProfile) => void
  toggles: Toggles
  onToggle: (key: keyof Toggles, value: boolean) => void
  decisions: string[]
}) {
  const [showLog, setShowLog] = useState(true)

  return (
    <section aria-label="Painel de simulação do orderForm" className="border-b border-white/10 bg-zinc-950 text-zinc-300">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 md:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-xs">
            <Terminal className="size-4 text-emerald-400" aria-hidden="true" />
            <span className="font-semibold uppercase tracking-wider text-zinc-100">Debug Mode</span>
            <span className="text-zinc-500">· orderForm context simulator</span>
          </div>
          <button
            type="button"
            onClick={() => setShowLog((s) => !s)}
            aria-expanded={showLog}
            className="flex items-center gap-1 font-mono text-xs text-zinc-400 hover:text-zinc-100"
          >
            <Bot className="size-3.5" aria-hidden="true" /> agent log
            <ChevronDown className={`size-3.5 transition-transform ${showLog ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-mono text-[11px] uppercase tracking-wider text-zinc-500">clientProfileData.segment</legend>
            <div className="flex flex-wrap gap-1.5">
              {PROFILE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onProfileChange(opt.value)}
                  aria-pressed={profile === opt.value}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    profile === opt.value
                      ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
                      : 'border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="mt-1 flex flex-wrap gap-2">
              <DebugToggle
                label="Habilitar VTEX Ads"
                icon={Megaphone}
                checked={toggles.vtexAds}
                onChange={(v) => onToggle('vtexAds', v)}
              />
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-mono text-[11px] uppercase tracking-wider text-zinc-500">payment.modules</legend>
            <div className="flex flex-wrap gap-2">
              <DebugToggle
                label="Habilitar Mix de Pagamentos"
                icon={SlidersHorizontal}
                checked={toggles.paymentMix}
                onChange={(v) => onToggle('paymentMix', v)}
              />
              <DebugToggle
                label="Habilitar Cupons"
                icon={Tag}
                checked={toggles.coupons}
                onChange={(v) => onToggle('coupons', v)}
              />
              <DebugToggle
                label="Habilitar Social Share"
                icon={Share2}
                checked={toggles.socialShare}
                onChange={(v) => onToggle('socialShare', v)}
              />
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-mono text-[11px] uppercase tracking-wider text-zinc-500">extra.apps</legend>
            <div className="flex flex-wrap gap-2">
              <DebugToggle
                label="Habilitar Save for Later"
                icon={Heart}
                checked={toggles.saveForLater}
                onChange={(v) => onToggle('saveForLater', v)}
              />
            </div>
          </fieldset>
        </div>

        <Collapse open={showLog}>
          <ul className="flex flex-col gap-1 rounded-md border border-white/10 bg-black/40 p-3 font-mono text-[11px]" aria-live="polite">
            {decisions.map((d) => (
              <li key={d} className="flex gap-2 animate-in fade-in slide-in-from-left-1 duration-300">
                <Sparkles className="mt-0.5 size-3 shrink-0 text-emerald-400" aria-hidden="true" />
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </Collapse>
      </div>
    </section>
  )
}

function DebugToggle({
  label,
  icon: Icon,
  checked,
  onChange,
}: {
  label: string
  icon: typeof Share2
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
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

const AD_BY_PROFILE: Record<BuyerProfile, { title: string; description: string }> = {
  new: {
    title: 'Kit Instalação Grátis · 1ª Compra',
    description: 'Clientes novos que levam a instalação profissional junto ganham frete grátis e suporte técnico prioritário.',
  },
  pix: {
    title: 'Garantia Estendida ElectroLar · R$ 49,90',
    description: 'Baseado no seu histórico com Pix, garanta 12 meses extras de cobertura com desconto.',
  },
  card: {
    title: 'Assinatura ElectroLar Plus · 3x sem juros',
    description: 'Baseado no seu perfil de compra no cartão, garanta frete grátis nas próximas 3 compras.',
  },
}

function VtexAdsBanner({ profile }: { profile: BuyerProfile }) {
  const ad = AD_BY_PROFILE[profile]
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Megaphone className="size-4 text-primary" aria-hidden="true" />
      </div>
      <div className="flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">{ad.title}</p>
          <ExtensionBadge label="vtex-ads" />
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Patrocinado
          </span>
        </div>
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
}: {
  isNewUser: boolean
  shipping: ShippingOption
  onShippingChange: (s: ShippingOption) => void
}) {
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
            (Object.keys(SHIPPING) as ShippingOption[]).map((key) => {
              const option = SHIPPING[key]
              const active = shipping === key
              return (
                <label
                  key={key}
                  className={`flex cursor-pointer items-center gap-4 rounded-lg border p-4 transition-colors ${
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
                  <Truck className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="block text-xs text-muted-foreground">{option.eta}</span>
                  </span>
                  <span className="text-sm font-medium tabular-nums">{brl(option.price)}</span>
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
  installments,
  onInstallmentsChange,
}: {
  amount: number
  installments: string
  onInstallmentsChange: (v: string) => void
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
        <select className={inputClass} value={installments} onChange={(e) => onInstallmentsChange(e.target.value)}>
          {[1, 2, 3, 5, 10].map((n) => (
            <option key={n} value={n}>
              {n}x de {brl(amount / n)} sem juros
            </option>
          ))}
        </select>
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
  isNewUser,
  warranty,
  isSplit,
  installments,
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
    total: number
    amounts: { method: PaymentMethod; percent: number; amount: number }[]
  }
  isNewUser: boolean
  warranty: boolean
  isSplit: boolean
  installments: number
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

        {vtexAdsEnabled && (
          <div className="border-t bg-primary/5 px-5 py-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ExtensionBadge label="vtex-ads" />
                <span className="text-xs font-medium text-muted-foreground">Complete o pedido e ganhe frete grátis</span>
              </div>
            </div>
            {totals.shippingValue === 0 && cartItems.some((i) => i.upsell) ? (
              <p className="text-xs font-medium text-success">Frete grátis liberado com o item adicionado 🎉</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {UPSELL_PRODUCTS.filter((p) => !cartItems.some((i) => i.id === p.id)).map((product) => (
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
        )}

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

        <dl className="flex flex-col gap-2 border-t px-5 py-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums">{brl(totals.subtotal)}</dd>
          </div>
          <Collapse open={warranty}>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Garantia Estendida</dt>
              <dd className="tabular-nums">{brl(WARRANTY_PRICE)}</dd>
            </div>
          </Collapse>
          <div className="flex justify-between">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <Truck className="size-4" aria-hidden="true" /> Frete
            </dt>
            <dd className={`tabular-nums ${totals.shippingValue === 0 ? 'font-medium text-success' : ''}`}>
              {totals.shippingValue === 0 ? 'Grátis' : brl(totals.shippingValue)}
            </dd>
          </div>
          <Collapse open={totals.discount > 0}>
            <div className="flex justify-between text-success">
              <dt>Desconto Pix (5%)</dt>
              <dd className="tabular-nums">- {brl(totals.discount)}</dd>
            </div>
          </Collapse>
          <div className="mt-2 flex items-baseline justify-between border-t pt-3">
            <dt className="font-semibold">Total</dt>
            <dd className="text-xl font-semibold tabular-nums" aria-live="polite">
              {brl(totals.total)}
            </dd>
          </div>
          {installments > 1 && (
            <p className="text-right text-xs text-muted-foreground">
              {installments}x de {brl(totals.total / installments)} sem juros
            </p>
          )}
          <Collapse open={isSplit}>
            <ul className="mt-1 flex flex-col gap-1 rounded-lg bg-muted/60 p-3 text-xs">
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
  installments,
  socialShare,
  shippingLabel,
  onBack,
}: {
  amounts: { method: PaymentMethod; percent: number; amount: number }[]
  total: number
  installments: number
  socialShare: boolean
  shippingLabel: string
  onBack: () => void
}) {
  const pix = amounts.find((a) => a.method === 'pix')
  const half = total / 2
  const shareText = encodeURIComponent(
    `Oi! Reservei um pedido na ElectroLar (#${ORDER_ID}). Falta ${brl(half)} para finalizar — o link expira em 2h: https://electrolar.example/pagar/${ORDER_ID}`,
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
            <p className="text-sm text-muted-foreground">Escaneie o QR Code no app do seu banco.</p>
          </div>
          <div className="rounded-xl border bg-white p-3">
            <QrMock />
          </div>
          <PixCountdown />
          <CopyPixButton />
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
                Você garantiu o pedido. O restante ({brl(half)}) pode ser pago por outra pessoa pelo link.
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

function CopyPixButton() {
  const [copied, setCopied] = useState(false)
  const code = `00020126580014BR.GOV.BCB.PIX0136electrolar-${ORDER_ID}5204000053039865802BR6009SAO PAULO`

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
      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
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
