import { useCallback, useEffect, useRef, useState } from 'react';
import type { DependencyList } from 'react';
import { errorKindOf, getErrorMessage } from '../lib/errors';
import type { ErrorKind } from '../lib/errors';
import { t } from '../lib/i18n';

interface AsyncDataState<T> {
  data: T | null;
  error: string | null;
  /** Natureza da falha (ex.: 'schema' quando a base de dados não tem a função ou coluna esperada). */
  errorKind: ErrorKind | null;
  isLoading: boolean;
}

export interface AsyncData<T> extends AsyncDataState<T> {
  reload: () => void;
}

/**
 * Carrega dados de forma assíncrona e expõe estados explícitos de carregamento e erro.
 * Respostas de pedidos anteriores são ignoradas quando as dependências mudam.
 */
export function useAsyncData<T>(loader: () => Promise<T>, dependencies: DependencyList): AsyncData<T> {
  const [state, setState] = useState<AsyncDataState<T>>({ data: null, error: null, errorKind: null, isLoading: true });
  const [reloadToken, setReloadToken] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let isCurrent = true;
    setState((previous) => ({ ...previous, isLoading: true, error: null, errorKind: null }));

    loaderRef
      .current()
      .then((data) => {
        if (isCurrent) setState({ data, error: null, errorKind: null, isLoading: false });
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setState((previous) => ({
            data: previous.data,
            error: getErrorMessage(error, t('Ocorreu um erro inesperado ao carregar os dados.')),
            errorKind: errorKindOf(error),
            isLoading: false,
          }));
        }
      });

    return () => {
      isCurrent = false;
    };
    // As dependências são definidas por quem chama o hook; o loader mais recente é lido via ref.
  }, [...dependencies, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { ...state, reload };
}
