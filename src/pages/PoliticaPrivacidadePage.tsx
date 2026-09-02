// Página pública (sem autenticação) — link exigido pelo Google no cadastro
// OAuth do app "ConectaGov Arquivos" (integração com o Google Drive usada
// pelo sistema). Precisa ficar fora de <RequireAuth> em App.tsx pra ser
// acessível por qualquer visitante, inclusive não logado.
export default function PoliticaPrivacidadePage() {
  return (
    <div className="min-h-screen bg-base-950 text-base-100 py-14 px-4">
      <div className="max-w-2xl mx-auto">
        <p className="text-[11px] font-bold uppercase tracking-wider text-accent-400 mb-2">ConectaGov Arquivos</p>
        <h1 className="text-3xl font-extrabold font-display mb-1">Política de Privacidade</h1>
        <p className="text-[13px] text-base-500 mb-10">Última atualização: 2 de setembro de 2026</p>

        <div className="bg-base-900 border border-base-800 rounded-2xl p-8 sm:p-10 flex flex-col gap-6">
          <div className="bg-accent-500/10 border-l-4 border-accent-500 rounded-lg px-4 py-3 text-[13px] text-base-400">
            Este documento descreve como a <strong className="text-base-200">CONECTAGOV REPRESENTAÇÕES LTDA</strong> (CNPJ 48.153.601/0001-60)
            trata dados no uso do sistema interno "ConectaGov" e de sua integração com o Google Drive, exigida pela Google para autorização de acesso via API.
          </div>

          <section>
            <h2 className="text-base font-bold mb-2">1. Quem somos</h2>
            <p className="text-[14px] text-base-300 leading-relaxed">
              A CONECTAGOV REPRESENTAÇÕES LTDA é uma empresa de assessoria e consultoria em licitações públicas, sediada em Vacaria/RS.
              O sistema "ConectaGov" é uma ferramenta de uso interno da empresa, usada para gerenciar clientes, licitações, documentos e
              informações financeiras relacionadas à própria operação — não é um produto oferecido ao público em geral.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2">2. Que dados tratamos</h2>
            <p className="text-[14px] text-base-300 leading-relaxed mb-2">No uso normal do sistema, tratamos:</p>
            <ul className="list-disc list-inside text-[14px] text-base-300 leading-relaxed flex flex-col gap-1">
              <li>Dados cadastrais de clientes da própria empresa (razão social, CNPJ, endereço, contatos);</li>
              <li>Documentos relacionados a processos licitatórios (editais, propostas, certidões, atestados, contratos);</li>
              <li>Informações financeiras internas (lançamentos, empenhos, comissões).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2">3. Integração com o Google Drive</h2>
            <p className="text-[14px] text-base-300 leading-relaxed mb-2">
              O sistema usa a API do Google Drive para armazenar os documentos citados acima, dentro de uma pasta dedicada
              ("ConectaGov Arquivos") em uma conta Google Drive de uso exclusivo e privado da empresa. Essa integração:
            </p>
            <ul className="list-disc list-inside text-[14px] text-base-300 leading-relaxed flex flex-col gap-1">
              <li>Não acessa nem lista arquivos pessoais do usuário fora dessa pasta dedicada;</li>
              <li>Não compartilha, publica ou expõe os arquivos armazenados publicamente;</li>
              <li>É usada exclusivamente pelo próprio sistema, de forma automatizada, para upload, leitura e exclusão dos
                documentos que os usuários da empresa enviam através da ferramenta.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2">4. Compartilhamento com terceiros</h2>
            <p className="text-[14px] text-base-300 leading-relaxed">
              Não vendemos, alugamos ou compartilhamos os dados tratados com terceiros para fins de marketing ou publicidade.
              O acesso aos dados é restrito aos colaboradores autorizados da própria empresa.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2">5. Segurança</h2>
            <p className="text-[14px] text-base-300 leading-relaxed">
              O acesso ao sistema é protegido por autenticação individual, e o acesso ao Google Drive é feito por credenciais
              de aplicação mantidas em ambiente seguro, nunca expostas publicamente.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2">6. Seus direitos (LGPD)</h2>
            <p className="text-[14px] text-base-300 leading-relaxed">
              Titulares de dados tratados pela empresa podem solicitar acesso, correção ou exclusão de suas informações a
              qualquer momento, através do contato abaixo.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2">7. Contato</h2>
            <p className="text-[14px] text-base-300 leading-relaxed mb-2">
              Dúvidas sobre esta política ou sobre o tratamento de dados podem ser enviadas para:
            </p>
            <div className="bg-base-850 border border-base-800 rounded-lg px-4 py-3 inline-block">
              <p className="text-[10px] font-bold uppercase tracking-wider text-base-500">E-mail</p>
              <p className="text-[14px] font-semibold text-base-100">conectagovrs@gmail.com</p>
            </div>
          </section>
        </div>

        <p className="text-center text-[11.5px] text-base-600 mt-8">
          CONECTAGOV REPRESENTAÇÕES LTDA · CNPJ 48.153.601/0001-60 · Vacaria/RS
        </p>
      </div>
    </div>
  )
}
