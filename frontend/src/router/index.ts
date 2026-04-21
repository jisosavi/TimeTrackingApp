import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('@/layouts/AppLayout.vue'),
      children: [
        {
          path: '',
          name: 'home',
          redirect: () => {
            const auth = useAuthStore()
            if (auth.user?.type === 'employee') return '/employee'
            if (auth.user?.type === 'supervisor') return '/manager'
            return '/admin'
          },
        },
        {
          path: 'employee',
          name: 'employee',
          component: () => import('@/views/EmployeeView.vue'),
          meta: { allowedTypes: ['employee'] },
        },
        {
          path: 'manager',
          name: 'manager',
          component: () => import('@/views/ManagerView.vue'),
          meta: { allowedTypes: ['supervisor', 'admin'] },
        },
        {
          path: 'admin',
          name: 'admin',
          component: () => import('@/views/AdminView.vue'),
          meta: { allowedTypes: ['admin'] },
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: 'login' }
  }

  if (to.name === 'login' && auth.isAuthenticated) {
    return { path: '/' }
  }

  if (to.meta.allowedTypes && auth.user) {
    if (!(to.meta.allowedTypes as string[]).includes(auth.user.type)) {
      return { path: '/' }
    }
  }
})

export default router
