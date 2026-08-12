import type { CaseExpectation, CaseKind, PoolCase } from './types'

const DEFAULT_TIMEOUT = 20000
const DEFAULT_SAMPLE = 12

function expectation(partial: Partial<CaseExpectation>): CaseExpectation {
  return {
    minInteractive: 5,
    maxInteractive: 4000,
    minFrames: 1,
    minShadowRoots: 0,
    maxBlindSpots: 40,
    maxFramesFailed: 0,
    ...partial
  }
}
function frozen(
  id: string,
  title: string,
  kind: CaseKind,
  location: string,
  expected: Partial<CaseExpectation>,
  overrides: Partial<PoolCase> = {}
): PoolCase {
  return {
    id,
    title,
    kind,
    source: 'frozen',
    location,
    scanLevel: 1,
    sampleSize: DEFAULT_SAMPLE,
    timeoutMs: DEFAULT_TIMEOUT,
    expected: expectation(expected),
    ...overrides
  }
}
export const POOL: readonly PoolCase[] = [
  frozen('classic-portal', 'Kurumsal portal', 'classic-html', 'classic/portal/index.html', {
    minInteractive: 40
  }),
  frozen('classic-news', 'Haber sitesi', 'classic-html', 'classic/news/index.html', {
    minInteractive: 80
  }),
  frozen('classic-docs', 'Dokuman sitesi', 'classic-html', 'classic/docs/index.html', {
    minInteractive: 60
  }),
  frozen('classic-table', 'Sayfalanan tablo', 'classic-html', 'classic/table/index.html', {
    minInteractive: 120
  }),
  frozen('classic-legacy', 'Eski tablo yerlesimi', 'classic-html', 'classic/legacy/index.html', {
    minInteractive: 25,
    maxBlindSpots: 60
  }),
  frozen('spa-dashboard', 'Yonetim paneli', 'spa', 'spa/dashboard/index.html', {
    minInteractive: 90
  }),
  frozen('spa-commerce', 'Urun listesi', 'spa', 'spa/commerce/index.html', {
    minInteractive: 140
  }),
  frozen('spa-kanban', 'Surukle birak pano', 'spa', 'spa/kanban/index.html', {
    minInteractive: 70
  }),
  frozen('spa-router', 'Istemci tarafi yonlendirme', 'spa', 'spa/router/index.html', {
    minInteractive: 30
  }),
  frozen('spa-modal', 'Katmanli diyalog', 'spa', 'spa/modal/index.html', { minInteractive: 20 }),
  frozen('spa-lazy', 'Tembel yuklenen bolumler', 'spa', 'spa/lazy/index.html', {
    minInteractive: 45
  }),
  frozen(
    'shadow-design-system',
    'Web bilesen kutuphanesi',
    'shadow-dom',
    'shadow/design/index.html',
    {
      minInteractive: 55,
      minShadowRoots: 30
    }
  ),
  frozen('shadow-nested', 'Ic ice shadow koku', 'shadow-dom', 'shadow/nested/index.html', {
    minInteractive: 25,
    minShadowRoots: 20
  }),
  frozen('shadow-closed', 'Kapali shadow modu', 'shadow-dom', 'shadow/closed/index.html', {
    minInteractive: 12,
    minShadowRoots: 8,
    maxBlindSpots: 60
  }),
  frozen('shadow-form', 'Bilesen tabanli form', 'shadow-dom', 'shadow/form/index.html', {
    minInteractive: 30,
    minShadowRoots: 15
  }),
  frozen('iframe-single', 'Tek seviye cerceve', 'nested-iframe', 'iframe/single/index.html', {
    minInteractive: 20,
    minFrames: 2
  }),
  frozen('iframe-deep', 'Uc seviye cerceve', 'nested-iframe', 'iframe/deep/index.html', {
    minInteractive: 24,
    minFrames: 4
  }),
  frozen('iframe-cross', 'Farkli kaynakli cerceve', 'nested-iframe', 'iframe/cross/index.html', {
    minInteractive: 18,
    minFrames: 3
  }),
  frozen('iframe-payment', 'Odeme cercevesi', 'nested-iframe', 'iframe/payment/index.html', {
    minInteractive: 14,
    minFrames: 2
  }),
  frozen('virtual-grid', 'Sanal veri izgarasi', 'virtual-list', 'virtual/grid/index.html', {
    minInteractive: 60,
    maxBlindSpots: 80
  }),
  frozen('virtual-feed', 'Sonsuz kaydirma akisi', 'virtual-list', 'virtual/feed/index.html', {
    minInteractive: 50,
    maxBlindSpots: 80
  }),
  frozen('virtual-tree', 'Sanal agac gorunumu', 'virtual-list', 'virtual/tree/index.html', {
    minInteractive: 40,
    maxBlindSpots: 80
  }),
  frozen('virtual-log', 'Canli gunluk penceresi', 'virtual-list', 'virtual/log/index.html', {
    minInteractive: 15,
    maxBlindSpots: 80
  }),
  frozen('form-wizard', 'Cok adimli sihirbaz', 'multi-step-form', 'form/wizard/index.html', {
    minInteractive: 35
  }),
  frozen('form-validation', 'Anlik dogrulama', 'multi-step-form', 'form/validation/index.html', {
    minInteractive: 28
  }),
  frozen('form-upload', 'Dosya yukleme adimi', 'multi-step-form', 'form/upload/index.html', {
    minInteractive: 18
  }),
  frozen('form-dynamic', 'Kosullu alanlar', 'multi-step-form', 'form/dynamic/index.html', {
    minInteractive: 32
  })
]
export function caseById(id: string): PoolCase | undefined {
  return POOL.find((entry) => entry.id === id)
}
export function casesByKind(kind: CaseKind): PoolCase[] {
  return POOL.filter((entry) => entry.kind === kind)
}
export function poolCoverage(): Record<CaseKind, number> {
  const out: Record<CaseKind, number> = {
    'classic-html': 0,
    spa: 0,
    'shadow-dom': 0,
    'nested-iframe': 0,
    'virtual-list': 0,
    'multi-step-form': 0
  }
  for (const entry of POOL) out[entry.kind]++
  return out
}
