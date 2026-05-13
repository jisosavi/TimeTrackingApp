import { createRouter, createWebHistory } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { AuthUser } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // --- Public login routes ---
    // /admin must be defined before /:slug so static wins over dynamic
    {
      path: '/admin',
      name: 'superadmin-login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true, loginType: 'superadmin' },
    },
    {
      path: '/:slug/admin',
      name: 'admin-login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true, loginType: 'admin' },
    },
    {
      path: '/:slug/approval',
      name: 'supervisor-login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true, loginType: 'supervisor' },
    },
    {
      path: '/:slug',
      name: 'employee-login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true, loginType: 'employee' },
    },

    // --- Authenticated routes (wrapped in AppLayout) ---
    {
      path: '/',
      component: () => import('@/layouts/AppLayout.vue'),
      children: [
        {
          path: 'admin/dashboard',
          name: 'superadmin-dashboard',
          component: () => import('@/views/SuperAdminView.vue'),
          meta: { requiresAuth: true, allowedTypes: ['superadmin'] },
        },
        {
          path: ':slug/home',
          name: 'employee-home',
          component: () => import('@/views/EmployeeView.vue'),
          meta: { requiresAuth: true, allowedTypes: ['employee'] },
        },
        {
          path: ':slug/home/time-off',
          name: 'employee-time-off',
          component: () => import('@/views/employee/TimeOffView.vue'),
          meta: { requiresAuth: true, allowedTypes: ['employee'] },
        },
        {
          path: ':slug/admin/dashboard',
          name: 'admin-dashboard',
          component: () => import('@/views/AdminView.vue'),
          meta: { requiresAuth: true, allowedTypes: ['admin'] },
        },
        {
          path: ':slug/approval/home',
          name: 'supervisor-home',
          component: () => import('@/views/ManagerView.vue'),
          meta: { requiresAuth: true, allowedTypes: ['supervisor', 'admin'] },
        },
        {
          path: ':slug/approval/time-off',
          name: 'supervisor-time-off',
          component: () => import('@/views/supervisor/TimeOffView.vue'),
          meta: { requiresAuth: true, allowedTypes: ['supervisor', 'admin'] },
        },
        {
          path: ':slug/admin/payroll-summary',
          name: 'admin-payroll-summary',
          component: () => import('@/views/PayrollView.vue'),
          meta: { requiresAuth: true, allowedTypes: ['admin'] },
        },
        {
          path: ':slug/admin/payroll',
          name: 'admin-payroll',
          redirect: (to) => ({ name: 'admin-payroll-summary', params: to.params }),
        },
        {
          path: ':slug/admin/payroll-settings',
          name: 'admin-payroll-settings',
          component: () => import('@/views/PayrollSettingsView.vue'),
          meta: { requiresAuth: true, allowedTypes: ['admin'] },
        },
      ],
    },

    { path: '/:pathMatch(.*)*', redirect: to => ({ path: '/admin', query: to.query }) },
  ],
})

function authHome(user: AuthUser): RouteLocationRaw {
  switch (user.type) {
    case 'superadmin':
      return { name: 'superadmin-dashboard' }
    case 'employee':
      return { name: 'employee-home', params: { slug: user.companySlug } }
    case 'admin':
      return { name: 'admin-payroll-summary', params: { slug: user.companySlug } }
    case 'supervisor':
      return { name: 'supervisor-home', params: { slug: user.companySlug } }
  }
}

function loginRouteForPath(to: { name: unknown; params: Record<string, unknown> }): RouteLocationRaw {
  const slug = to.params.slug as string | undefined
  if (!slug) return { name: 'superadmin-login' }
  const name = to.name as string
  if (['admin-dashboard', 'admin-payroll', 'admin-payroll-summary', 'admin-payroll-settings'].includes(name)) return { name: 'admin-login', params: { slug } }
  if (name === 'supervisor-home') return { name: 'supervisor-login', params: { slug } }
  return { name: 'employee-login', params: { slug } }
}

router.beforeEach((to) => {
  const auth = useAuthStore()

  // Already authenticated — skip login pages
  if (to.meta.public && auth.isAuthenticated) {
    return authHome(auth.user!)
  }

  // Not authenticated — redirect to appropriate login
  if (!to.meta.public && !auth.isAuthenticated) {
    const target = loginRouteForPath(to)
    if (to.query.code) {
      return typeof target === 'object'
        ? { ...target, query: { code: to.query.code } }
        : { path: String(target), query: { code: to.query.code } }
    }
    return target
  }

  // Wrong role for this route
  if (to.meta.allowedTypes && auth.user) {
    if (!(to.meta.allowedTypes as string[]).includes(auth.user.type)) {
      return authHome(auth.user)
    }
  }
})

export default router
