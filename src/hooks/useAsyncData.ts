import { useCallback, useEffect, useRef, useState } from 'react';
import type { DependencyList } from 'react';
import { getErrorMessage } from '../lib/errors';

interface AsyncDataState<T> {
  data: T | null;
  error: string | null;
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
  const [state, setState] = useState<AsyncDataState<T>>({ data: null, error: null, isLoading: true });
  const [reloadToken, setReloadToken] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let isCurrent = true;
    setState((previous) => ({ ...previous, isLoading: true, error: null }));

    loaderRef
      .current()
      .then((data) => {
        if (isCurrent) setState({ data, error: null, isLoading: false });
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setState((previous) => ({
            data: previous.data,
            error: getErrorMessage(error, 'Ocorreu um erro inesperado ao carregar os dados.'),
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
