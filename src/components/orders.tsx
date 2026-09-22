'use client';
import { useEffect,useRef,useState } from 'react';
import Link from 'next/link';
import { api } from './forms';
import type { Order } from '../modules/orders/service';
import { cents,fixed } from '../modules/sales/validation';

type Product={id:string;name:string;code:string;price:string;stock:string;unit:string};
type Options={warehouses:{id:string;name:string}[];sessions:{id:string;name:string;openedBy:string}[]};
const labels:Record<string,string>={PENDING:'Pendente',CONFIRMED:'Faturado',CANCELLED:'Cancelado'};
const money=(v:string)=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=(v:string)=>new Date(v).toLocaleString('pt-BR',{timeZone:'America/Cuiaba'});
const methods=[['CASH','Dinheiro'],['PIX','PIX'],['DEBIT_CARD','Cartão de débito'],['CREDIT_CARD','Cartão de crédito']] as const;

function ProductPicker({warehouse,value,onChange,disabled,index}:{warehouse:string;value?:Product;onChange:(p?:Product)=>void;disabled:boolean;index:number}) {
 const [q,setQ]=useState(''),[rows,setRows]=useState<Product[]>([]),[error,setError]=useState('');
 useEffect(()=>{let active=true;setRows([]);setError('');if(!warehouse||!q.trim())return;
 const timer=setTimeout(()=>{api('/api/sales/lookup?'+new URLSearchParams({kind:'products',warehouseId:warehouse,q}),'GET').then(r=>{if(active)setRows(r.products);}).catch(e=>{if(active)setError(e.message);});},250);
 return()=>{active=false;clearTimeout(timer);};},[q,warehouse]);
 return <div className="form"><label>Buscar no estoque<input aria-label={'Buscar produto do item '+(index+1)} value={q} disabled={disabled||!warehouse} placeholder="Nome ou código do produto" onChange={e=>{setQ(e.target.value);onChange(undefined);}}/></label>
 {value?<p><strong>{value.name}</strong> · {value.code} · {money(value.price)} · Saldo: {value.stock} {value.unit}</p>:<div className="product-results">{rows.map(p=><button type="button" className="secondary" disabled={disabled} key={p.id} onClick={()=>{onChange(p);setRows([]);}}>{p.name} · {p.code} · {money(p.price)}</button>)}</div>}
 {error&&<p role="alert" className="error">{error}</p>}</div>;
}

export function Orders(){
 const [rows,setRows]=useState<Order[]>([]),[total,setTotal]=useState(0),[status,setStatus]=useState('PENDING'),[page,setPage]=useState(1),[refresh,setRefresh]=useState(0),[loading,setLoading]=useState(true);
 const [order,setOrder]=useState<Order|null>(null),[options,setOptions]=useState<Options>({warehouses:[],sessions:[]}),[warehouse,setWarehouse]=useState(''),[session,setSession]=useState('');
 const [mapping,setMapping]=useState<Record<number,Product|undefined>>({}),[method,setMethod]=useState('PIX'),[confirmed,setConfirmed]=useState(false),[reason,setReason]=useState('');
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);const busyRef=useRef(false),operation=useRef('');
 useEffect(()=>{let active=true;async function load(){try{const r=await api('/api/orders?'+new URLSearchParams({status,page:String(page)}),'GET');if(active){setRows(r.orders);setTotal(r.total);}}catch(e){if(active)setError(e instanceof Error?e.message:'Falha ao carregar pedidos.');}finally{if(active)setLoading(false);}}
 setLoading(true);void load();const timer=setInterval(()=>{if(!document.hidden)void load();},30000);return()=>{active=false;clearInterval(timer);};},[status,page,refresh]);
 useEffect(()=>{let active=true;api('/api/orders/options','GET').then(r=>{if(active){setOptions(r);setWarehouse(w=>w||r.warehouses[0]?.id||'');}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[refresh]);
 async function run(fn:()=>Promise<void>){if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');setMessage('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'Não foi possível concluir.');}finally{busyRef.current=false;setBusy(false);}}
 async function open(id:string){await run(async()=>{setOrder(await api('/api/orders/'+id,'GET'));setMapping({});setReason('');setConfirmed(false);operation.current=crypto.randomUUID();});}
 const mappedTotal=order?.items.reduce((sum,line,index)=>sum+(mapping[index]?cents(mapping[index]!.price)*BigInt(line.quantity):0n),0n)??0n;
 const complete=!!order&&order.items.length>0&&order.items.every((_,index)=>mapping[index]);
 const matches=!!order&&fixed(mappedTotal)===order.total;
 return <>
 <div className="toolbar"><label>Situação<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="ALL">Todos</option>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><button className="secondary" disabled={busy} onClick={()=>setRefresh(v=>v+1)}>Atualizar pedidos</button></div>
 <p className="input-help">Atualização automática a cada 30 segundos. Os pedidos só baixam estoque após o faturamento.</p>
 {error&&<p role="alert" className="error">{error}</p>}{message&&<p role="status" className="success">{message}</p>}
 {order&&<section className="card editor"><div className="section-heading"><h2>Pedido #{order.number}</h2><button className="secondary" disabled={busy} onClick={()=>setOrder(null)}>Fechar pedido</button></div>
 <p><strong>{order.customerName}</strong> · {order.phone||'Sem telefone'} · {order.email}</p><p className="muted">{date(order.createdAt)} · {labels[order.status]}</p>{order.notes&&<p>Observações: {order.notes}</p>}
 <div className="table-scroll"><table><thead><tr><th>Item solicitado</th><th>Quantidade</th><th>Preço no site</th></tr></thead><tbody>{order.items.map((item,index)=><tr key={index}><td>{item.name}</td><td>{item.quantity}</td><td>{money(String(item.price))}</td></tr>)}</tbody></table></div><p className="sales-total"><strong>Total do pedido: {money(order.total)}</strong></p>
 {order.saleId?<p className="success">Venda #{order.saleNumber} · {order.saleStatus==='CANCELLED'?'Venda cancelada; consulte o histórico.':'Faturamento registrado.'} <Link href={'/vendas?saleId='+order.saleId}>Ver venda</Link></p>:order.status==='PENDING'&&<fieldset disabled={busy} className="sales-fields">
 <h3>Conferência para faturamento</h3><p className="input-help">Associe cada item ao produto correto do ERP. Os preços e o total devem coincidir com o pedido. Confira o recebimento antes de confirmar.</p>
 <label>Depósito<select value={warehouse} onChange={e=>{setWarehouse(e.target.value);setMapping({});setConfirmed(false);}}>{options.warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
 {order.items.map((item,index)=><section key={index} className="card editor"><h3>{item.quantity} × {item.name}</h3><ProductPicker key={order.id+warehouse+index} index={index} warehouse={warehouse} value={mapping[index]} disabled={busy} onChange={p=>{setMapping(v=>({...v,[index]:p}));setConfirmed(false);}}/></section>)}
 <p><strong>Total no ERP: {money(fixed(mappedTotal))}</strong></p>{complete&&!matches&&<p className="notice">O total difere do pedido. Confira a associação e os preços cadastrados antes de faturar.</p>}
 <div className="form-grid"><label>Caixa para recebimento<select value={session} onChange={e=>{setSession(e.target.value);setConfirmed(false);}}><option value="">Selecione um caixa aberto</option>{options.sessions.map(s=><option key={s.id} value={s.id}>{s.name} · {s.openedBy}</option>)}</select></label><label>Forma de pagamento<select value={method} onChange={e=>{setMethod(e.target.value);setConfirmed(false);}}>{methods.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div>
 {!options.sessions.length&&<p className="notice">Peça ao responsável para abrir um caixa na aba Vendas e atualize os pedidos.</p>}
 <label className="order-confirmation"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> Conferi os produtos e o recebimento de {money(order.total)}.</label>
 <button disabled={busy||!complete||!matches||!session||!warehouse||!confirmed} onClick={()=>run(async()=>{const result=await api('/api/orders/'+order.id+'/invoice','POST',{warehouseId:warehouse,expectedTotal:fixed(mappedTotal),mappings:order.items.map((_,index)=>({index,productId:mapping[index]!.id,expectedPrice:mapping[index]!.price})),payment:{operationKey:operation.current,sessionId:session,payments:[{method,amount:order.total}]}});setOrder(await api('/api/orders/'+order.id,'GET'));setMessage(result.replayed?'Este pedido já havia sido faturado.':'Pedido faturado. Venda, pagamento e baixa de estoque registrados.');setRefresh(v=>v+1);})}>{busy?'Processando…':'Faturar pedido'}</button>
 <details><summary>Cancelar pedido pendente</summary><label>Motivo<input value={reason} onChange={e=>setReason(e.target.value)} maxLength={500}/></label><button className="secondary" disabled={busy||reason.trim().length<5} onClick={()=>run(async()=>{await api('/api/orders/'+order.id+'/cancel','POST',{reason});setOrder(await api('/api/orders/'+order.id,'GET'));setMessage('Pedido cancelado, sem movimentar estoque.');setRefresh(v=>v+1);})}>Confirmar cancelamento</button></details>
 </fieldset>}{order.cancelReason&&<p>Cancelamento: {order.cancelReason}</p>}<p className="stage-note">Faturamento interno, sem emissão de nota fiscal. Não realiza cobrança bancária automática.</p></section>}
 <section className="card users-table catalog-table"><div className="section-heading"><h2>Pedidos do site <span className="count">{total}</span></h2></div>{loading?<p role="status" className="empty">Carregando pedidos…</p>:!rows.length?<p className="empty">Nenhum pedido nesta situação.</p>:<div className="table-scroll"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Situação</th><th>Total</th><th>Ação</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><strong>#{row.number}</strong><small>{date(row.createdAt)}</small></td><td>{row.customerName}</td><td>{labels[row.status]}{row.saleStatus==='CANCELLED'?' · Venda cancelada':''}</td><td>{money(row.total)}</td><td><button className="secondary" disabled={busy} onClick={()=>open(row.id)}>Conferir pedido #{row.number}</button></td></tr>)}</tbody></table></div>}
 <div className="pagination"><span>Página {page}</span><div><button className="secondary" disabled={page===1||loading} onClick={()=>setPage(p=>p-1)}>Anterior</button><button className="secondary" disabled={page*25>=total||loading} onClick={()=>setPage(p=>p+1)}>Próxima</button></div></div></section>
 </>;
}
