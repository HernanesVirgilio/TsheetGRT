import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronRight, LogOut } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { parseOpenSections } from '../../utils/navigation';
import type { OpenSections } from '../../utils/navigation';
import { BrandMark } from './BrandMark';
import { UserAvatar } from '../ui/UserAvatar';
import { currentLocation, isItemCurrent, visibleNavigation } from './navigationConfig';
import type { NavigationItem, NavigationSection } from './navigationConfig';
import { t } from '../../lib/i18n';

// Preferência de interface (não sensível): sobrevive à navegação e a novas sessões neste browser.
const OPEN_SECTIONS_STORAGE_KEY = 'tsheetgrt.sidebar.open-sections';

function readStoredOpenSections(): OpenSections {
  try {
    return parseOpenSections(window.localStorage.getItem(OPEN_SECTIONS_STORAGE_KEY));
  } catch {
    return {};
  }
}

function storeOpenSections(openSections: OpenSections): void {
  try {
    window.localStorage.setItem(OPEN_SECTIONS_STORAGE_KEY, JSON.stringify(openSections));
  } catch {
    // Armazenamento indisponível (modo privado, bloqueado): o menu funciona sem memória.
  }
}

// Contorno de foco branco: o verde do foco global não tem contraste suficiente sobre o fundo do menu.
const FOCUS_CLASS = 'focus-visible:outline-white';

interface SidebarLinkProps {
  item: NavigationItem;
  isCurrent: boolean;
  onNavigate?: () => void;
}

const SidebarLink: React.FC<SidebarLinkProps> = ({ item, isCurrent, onNavigate }) => {
  const Icon = item.icon;
  return (
    <li>
      <NavLink
        to={item.to}
        end={item.end}
        onClick={onNavigate}
        aria-current={isCurrent ? 'page' : undefined}
        className={`relative flex items-center gap-3 rounded-md py-1.5 pl-3 pr-2 text-sm transition-colors ${FOCUS_CLASS} ${
          isCurrent ? 'bg-white/15 font-semibold text-white' : 'font-medium text-sidebar-muted hover:bg-sidebar-hover hover:text-white'
        }`}
      >
        {/* Indicador da página atual: barra verde à esquerda (não depende só da cor do fundo). */}
        {isCurrent && <span aria-hidden="true" className="absolute inset-y-1 left-0 w-1 rounded-r bg-primary" />}
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">{item.label}</span>
      </NavLink>
    </li>
  );
};

interface SidebarGroupProps {
  section: NavigationSection;
  pathname: string;
  isOpen: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}

/**
 * Grupo do menu. Com vários destinos, o título recolhe e expande o grupo; com um só destino
 * (Aprovações, Relatórios) o título é apenas uma legenda e o destino está sempre visível.
 */
const SidebarGroup: React.FC<SidebarGroupProps> = ({ section, pathname, isOpen, onToggle, onNavigate }) => {
  const listId = `menu-grupo-${section.id}`;
  const hasCurrent = section.items.some((item) => isItemCurrent(item, pathname));
  const isCollapsible = section.items.length > 1;
  const showItems = !isCollapsible || isOpen;

  return (
    <div className="pt-3">
      {isCollapsible ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={listId}
          className={`flex w-full items-center gap-1.5 rounded-md px-3 py-1 text-left text-[11px] font-semibold uppercase tracking-wider hover:text-white ${FOCUS_CLASS} ${
            hasCurrent && !isOpen ? 'text-white' : 'text-sidebar-muted/80'
          }`}
        >
          <span className="flex-1">{section.title}</span>
          <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true" />
        </button>
      ) : (
        <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted/80">{section.title}</p>
      )}
      <ul id={listId} hidden={!showItems} className="mt-1 space-y-0.5">
        {section.items.map((item) => (
          <SidebarLink key={item.to} item={item} isCurrent={isItemCurrent(item, pathname)} onNavigate={onNavigate} />
        ))}
      </ul>
    </div>
  );
};

interface SidebarProps {
  onNavigate?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onNavigate }) => {
  const { currentUser, hasPermission, signOut } = useAuth();
  const { pathname } = useLocation();

  const sections = visibleNavigation(hasPermission);
  const [home, ...groups] = sections[0]?.id === 'home' ? sections : [null, ...sections];
  const activeSectionId = currentLocation(sections, pathname)?.section.id ?? null;

  // Trabalho começa aberto; o grupo da página atual abre-se sempre; os restantes ficam como o utilizador os deixou.
  const [openSections, setOpenSections] = useState<OpenSections>(() => {
    const stored = { work: true, collaboration: true, ...readStoredOpenSections() };
    return activeSectionId ? { ...stored, [activeSectionId]: true } : stored;
  });

  // Ao chegar a outra página (pelo menu, um atalho ou uma notificação), abre o grupo que a contém.
  useEffect(() => {
    if (!activeSectionId) return;
    setOpenSections((previous) => (previous[activeSectionId] ? previous : { ...previous, [activeSectionId]: true }));
  }, [activeSectionId, pathname]);

  useEffect(() => {
    storeOpenSections(openSections);
  }, [openSections]);

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col bg-sidebar text-white">
      <div className="flex h-16 items-center border-b border-white/15 px-4">
        <BrandMark inverted />
      </div>

      <nav aria-label={t('Navegação principal')} className="relative min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-3 custom-scrollbar">
        {home && (
          <ul className="space-y-0.5">
            {home.items.map((item) => (
              <SidebarLink key={item.to} item={item} isCurrent={isItemCurrent(item, pathname)} onNavigate={onNavigate} />
            ))}
          </ul>
        )}
        {groups.map(
          (section) =>
            section && (
              <SidebarGroup
                key={section.id}
                section={section}
                pathname={pathname}
                isOpen={openSections[section.id] ?? false}
                onToggle={() => setOpenSections((previous) => ({ ...previous, [section.id]: !previous[section.id] }))}
                onNavigate={onNavigate}
              />
            )
        )}
      </nav>

      {currentUser && (
        <div className="flex items-center gap-2.5 border-t border-white/15 px-3 py-3">
          <UserAvatar name={currentUser.full_name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{currentUser.display_name ?? currentUser.full_name}</p>
            <p className="truncate text-xs text-sidebar-muted">{currentUser.role?.name ?? t('Sem perfil de acesso')}</p>
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            aria-label={t('Terminar sessão')}
            title={t('Terminar sessão')}
            className={`shrink-0 rounded-md p-2 text-sidebar-muted hover:bg-sidebar-hover hover:text-white ${FOCUS_CLASS}`}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </aside>
  );
};
